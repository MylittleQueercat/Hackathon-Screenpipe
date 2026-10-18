missing: []

| Pair | Judgment (order) | Preferred | Strength |
|---|---|---|---|
| p1-receipts | j01 (a: X=base) | stack | strong |
| p1-receipts | j02 (b: X=stack) | stack | strong |

| Pair | Both orders agree | Verdict |
|---|---|---|
| p1-receipts | yes | stack |

Mean score per metric (all judgments), base -> stack
  faithful     3.00 -> 4.00  (n=2)
  procedure    2.00 -> 4.00  (n=2)
  exceptions   3.00 -> 5.00  (n=2)
  usable       2.00 -> 4.00  (n=2)
  calibration  3.00 -> 3.50  (n=2)
  numbers      3.00 -> 2.50  (n=2)
  clarity      3.00 -> 4.50  (n=2)

Per pair mean (correctness = faithful, procedure, exceptions, rule_change), base -> stack
  p1-receipts  correctness 2.67 -> 4.33; all 2.71 -> 3.93
