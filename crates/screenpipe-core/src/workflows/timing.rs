// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! The agent identifies complete occurrences. Verify their cited boundaries and
//! calculate elapsed time, never active time or durations from arbitrary samples.
use super::*;

pub fn normalize_timing(value: &Value, catalog: &EvidenceCatalog) -> Result<Value, String> {
    let Some(value) = value.get("timingRuns").filter(|v| !v.is_null()) else {
        return Ok(Value::Null);
    };
    let proposed = value.as_array().ok_or("timingRuns must be an array")?;
    if proposed.is_empty() {
        return Ok(Value::Null);
    }
    if proposed.len() > 30 {
        return Err("Keep at most 30 representative timing runs per workflow or step".into());
    }
    let boundary = |value: &Value, at_key: String| -> Result<(DateTime<Utc>, Value), String> {
        let at = value["timestamp"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.with_timezone(&Utc))
            .ok_or("Timing needs an exact source timestamp")?;
        let app = value["app"].as_str().ok_or("Timing needs a source app")?;
        let quote = match value["quote"].as_str().map(str::trim) {
            Some(q) if (12..=1200).contains(&q.chars().count()) => q,
            Some(q) if !q.is_empty() => {
                return Err(format!(
                    "{at_key}: a timing quote needs 12 to 1,200 characters of the capture's text; \
                     this one has {}",
                    q.chars().count()
                ))
            }
            _ => {
                return Err(format!(
                    "{at_key}: cite the source text supporting this timing boundary in quote"
                ))
            }
        };
        let captures: Vec<_> = catalog
            .points
            .iter()
            .filter(|p| {
                cites_capture(at, p.timestamp)
                    && p.app.eq_ignore_ascii_case(app)
                    && matches!(p.source.as_str(), "screen" | "parsed")
            })
            .collect();
        // Say which boundary failed and why, so it can be fixed in one revision.
        let at_text = at.to_rfc3339();
        let point = captures
            .iter()
            .find(|p| contains_source_quote(&p.detail, quote))
            .ok_or_else(
                || match (captures.is_empty(), explain_unresolved(catalog, at, app)) {
                    (true, Some(why)) => format!("{at_key} cites {app} at {at_text}, but {why}"),
                    (true, None) => format!(
                        "{at_key} cites {app} at {at_text}, which is not a recorded screen capture"
                    ),
                    (false, _) => format!(
                        "{at_key}: the {}",
                        quote_mismatch(app, &at_text, &captures[0].detail, quote)
                    ),
                },
            )?;
        Ok((
            point.timestamp,
            json!({"timestamp":point.timestamp.to_rfc3339(),"app":point.app,"quote":quote}),
        ))
    };
    let mut runs = Vec::new();
    for (index, run) in proposed.iter().enumerate() {
        let (start, start_source) = boundary(&run["start"], format!("[{index}].start"))?;
        let (end, end_source) = boundary(&run["end"], format!("[{index}].end"))?;
        if end <= start {
            return Err("A timing run must finish after it starts".into());
        }
        let summary = non_empty_string(run, "summary")
            .ok_or("Explain why the timing boundaries belong to one complete occurrence")?;
        runs.push((
            start,
            end,
            json!({"start":start_source,"end":end_source,
            "summary":summary.chars().take(400).collect::<String>()}),
        ));
    }
    runs.sort_by_key(|r| r.0);
    if runs.windows(2).any(|pair| pair[1].0 < pair[0].1) {
        return Err("Timing runs overlap or repeat. Keep each occurrence once".into());
    }
    let minutes: Vec<f64> = runs
        .iter()
        .map(|(start, end, _)| (*end - *start).num_milliseconds() as f64 / 60_000.0)
        .collect();
    Ok(
        json!({"basis":"estimated-elapsed", "sampleCount":runs.len(),
        "averageMinutes":minutes.iter().sum::<f64>() / minutes.len() as f64,
        "minMinutes":minutes.iter().copied().fold(f64::INFINITY, f64::min),
        "maxMinutes":minutes.iter().copied().fold(0.0, f64::max),
        "runs":runs.into_iter().map(|(_, _, run)|run).collect::<Vec<_>>()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Value, EvidenceCatalog) {
        let mut catalog = EvidenceCatalog::default();
        let runs: Vec<Value> = [10, 20, 60].into_iter().enumerate().map(|(index, minutes)| {
            let start = DateTime::parse_from_rfc3339("2026-09-01T09:00:00Z").unwrap().with_timezone(&Utc) + ChronoDuration::days(index as i64);
            let mut source = |at, text: &str| {
                catalog.points.push(EvidencePoint { timestamp: at, app: "Docs".into(), detail: text.into(), source: "screen".into(), speaker: None });
                json!({"timestamp":at.to_rfc3339(),"app":"Docs","quote":text})
            };
            json!({"start":source(start,"Begin the research review"), "end":source(start + ChronoDuration::minutes(minutes),"Research review is complete"), "summary":"One research review from start to completion"})
        }).collect();
        (json!({"timingRuns":runs,"totalMinutes":9999}), catalog)
    }
    #[test]
    fn a_failing_boundary_says_which_and_why() {
        let (mut input, mut catalog) = fixture();
        input["timingRuns"][1]["end"]["quote"] = json!("A sentence nobody wrote");
        let quote = normalize_timing(&input, &catalog).unwrap_err();
        assert!(
            quote.starts_with("[1].end: the quote is not in the text of the Docs capture at"),
            "{quote}"
        );
        let (mut input, _) = fixture();
        input["timingRuns"][0]["start"]["app"] = json!("Finder");
        let at = DateTime::parse_from_rfc3339("2026-09-01T09:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        catalog
            .nearby
            .insert((at, "finder".into()), vec![(at, "Docs".into())]);
        let app = normalize_timing(&input, &catalog).unwrap_err();
        assert!(app.starts_with("[0].start cites Finder at 2026-09-01T09:00:00+00:00, but the capture at that time is Docs, not Finder"), "{app}");
    }
    #[test]
    fn a_short_boundary_quote_says_how_long_it_must_be() {
        let (mut input, catalog) = fixture();
        input["timingRuns"][2]["start"]["quote"] = json!("Begin");
        let why = normalize_timing(&input, &catalog).unwrap_err();
        assert_eq!(why, "[2].start: a timing quote needs 12 to 1,200 characters of the capture's text; this one has 5");
        input["timingRuns"][2]["start"]["quote"] = json!(" ");
        let why = normalize_timing(&input, &catalog).unwrap_err();
        assert!(why.starts_with("[2].start: cite the source text"), "{why}");
    }
    #[test]
    fn average_uses_distinct_runs_not_days_or_model_numbers() {
        let (input, catalog) = fixture();
        let result = normalize_timing(&input, &catalog).unwrap();
        assert_eq!(result["averageMinutes"], 30.0);
        assert_eq!(result["sampleCount"], 3);
        assert_eq!(result["minMinutes"], 10.0);
        assert_eq!(result["maxMinutes"], 60.0);
        assert_eq!(result["basis"], "estimated-elapsed");
    }
    #[test]
    fn wrapped_boundary_quotes_keep_the_same_measured_runs() {
        let (input, mut catalog) = fixture();
        for point in &mut catalog.points {
            point.detail = point.detail.replace(' ', "\n  ");
        }
        let result = normalize_timing(&input, &catalog).unwrap();
        assert_eq!(result["averageMinutes"], 30.0);
        assert_eq!(result["sampleCount"], 3);
    }
    #[test]
    fn whole_second_boundaries_name_the_capture_in_that_second() {
        let (input, mut catalog) = fixture();
        for point in &mut catalog.points {
            point.timestamp += ChronoDuration::milliseconds(250);
        }
        let result = normalize_timing(&input, &catalog).unwrap();
        assert_eq!(result["averageMinutes"], 30.0);
        let stored = result["runs"][0]["start"]["timestamp"].as_str().unwrap();
        assert_eq!(
            DateTime::parse_from_rfc3339(stored).unwrap(),
            catalog.points[0].timestamp
        );
        // A citation with its own fraction still has to match exactly.
        let mut off = input;
        off["timingRuns"][0]["start"]["timestamp"] = json!("2026-09-01T09:00:00.500Z");
        assert!(normalize_timing(&off, &catalog).is_err());
    }
    #[test]
    fn sparse_evidence_without_explicit_runs_is_not_a_duration() {
        let (_, catalog) = fixture();
        assert!(normalize_timing(&json!({"totalMinutes":9999}), &catalog)
            .unwrap()
            .is_null());
    }
    #[test]
    fn catalog_normalization_retains_timing_and_rejects_invalid_updates() {
        let (mut workflow, catalog) = fixture();
        workflow["title"] = json!("Research review");
        workflow["description"] = json!("Review research from beginning to completion");
        workflow["stages"] = json!(["start", "end"].into_iter().map(|key| {
            let boundary = &workflow["timingRuns"][0][key];
            json!({"name":key,"description":"A source-backed review step","evidence":[boundary],
                "procedure":[{"kind":"action","text":"Review research","timestamp":boundary["timestamp"],"app":boundary["app"],"quote":boundary["quote"]}]})
        }).collect::<Vec<_>>());
        // Each step has independent samples; unknown steps must stay unknown.
        workflow["stages"][0]["timingRuns"] = json!([workflow["timingRuns"][0]]);
        let result = normalize_analysis(
            json!({"evidenceVersion":2,"workflows":[workflow.clone()]}),
            90,
            &catalog,
        )
        .unwrap();
        assert_eq!(result["workflows"][0]["timing"]["averageMinutes"], 30.0);
        assert_eq!(
            result["workflows"][0]["stages"][0]["timing"]["averageMinutes"],
            10.0
        );
        assert_eq!(
            result["workflows"][0]["stages"][0]["timing"]["sampleCount"],
            1
        );
        assert!(result["workflows"][0]["stages"][1]["timing"].is_null());
        let mut bad_step = workflow.clone();
        bad_step["stages"][0]["timingRuns"][0]["end"]["quote"] =
            json!("Fabricated step completion");
        assert!(normalize_analysis(
            json!({"evidenceVersion":2,"workflows":[bad_step]}),
            90,
            &catalog
        )
        .is_err());
        // Timing does not promote elapsed time to active time or verified steps.
        assert_eq!(result["workflows"][0]["activeMinutes"], 0);
        workflow["timingRuns"][0]["start"]["timestamp"] = json!("2020-01-01T00:00:00Z");
        assert!(normalize_analysis(
            json!({"evidenceVersion":2,"workflows":[workflow]}),
            90,
            &catalog
        )
        .is_err());
    }
    #[test]
    fn rejects_duplicate_reversed_and_unsupported_boundaries() {
        let (input, catalog) = fixture();
        let mut duplicate = input.clone();
        let first = duplicate["timingRuns"][0].clone();
        duplicate["timingRuns"].as_array_mut().unwrap().push(first);
        assert!(normalize_timing(&duplicate, &catalog)
            .unwrap_err()
            .contains("overlap"));
        let mut reversed = input.clone();
        reversed["timingRuns"][0]["end"] = input["timingRuns"][0]["start"].clone();
        assert!(normalize_timing(&reversed, &catalog).is_err());
        let mut invented = input;
        invented["timingRuns"][0]["start"]["quote"] = json!("An invented beginning of work");
        assert!(normalize_timing(&invented, &catalog).is_err());
    }
}
