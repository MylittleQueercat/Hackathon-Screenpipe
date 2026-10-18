missing: []

| Pair | Judgment (order) | Preferred | Strength |
|---|---|---|---|
| p1-email | j08 (a: X=stack) | base | strong |
| p1-email | j03 (b: X=base) | base | strong |
| p1-receipts | j12 (a: X=base) | base | clear |
| p1-receipts | j01 (b: X=stack) | base | clear |
| p2-email | j05 (a: X=stack) | base | strong |
| p2-email | j02 (b: X=base) | base | strong |
| p2-receipts | j10 (a: X=base) | base | clear |
| p2-receipts | j07 (b: X=stack) | base | clear |
| p3-email | j09 (a: X=base) | base | strong |
| p3-email | j04 (b: X=stack) | base | strong |
| p3-receipts | j06 (a: X=base) | base | slight |
| p3-receipts | j11 (b: X=stack) | base | slight |

| Pair | Both orders agree | Verdict |
|---|---|---|
| p1-email | yes | base |
| p1-receipts | yes | base |
| p2-email | yes | base |
| p2-receipts | yes | base |
| p3-email | yes | base |
| p3-receipts | yes | base |

Mean score per metric (all judgments), base -> stack
  faithful     3.67 -> 2.50  (n=12)
  procedure    3.33 -> 2.33  (n=12)
  exceptions   3.67 -> 2.75  (n=12)
  rule_change  4.12 -> 3.25  (n=8)
  usable       3.58 -> 2.33  (n=12)
  calibration  3.33 -> 2.50  (n=12)
  numbers      3.50 -> 2.17  (n=12)
  clarity      3.75 -> 3.67  (n=12)

Per pair mean (correctness = faithful, procedure, exceptions, rule_change), base -> stack
  p1-email     correctness 3.00 -> 2.50; all 3.29 -> 2.50
  p1-receipts  correctness 4.00 -> 2.50; all 3.71 -> 2.57
  p2-email     correctness 3.38 -> 2.12; all 3.44 -> 2.25
  p2-receipts  correctness 3.75 -> 3.00; all 3.69 -> 3.00
  p3-email     correctness 4.12 -> 2.25; all 4.06 -> 2.25
  p3-receipts  correctness 3.62 -> 3.50; all 3.38 -> 3.38
