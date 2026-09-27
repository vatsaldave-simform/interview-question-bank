# Query plans at 10,009 Questions

Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the
deployment: free-tier compute is throttled and shared, so a timing taken there measures
the host's spare capacity rather than the indexing decision it is meant to defend
(ADR-0012).

Measured at 2026-09-27T18:25:15.330Z against PostgreSQL 16.15.

Every statement is the one the search sends, taken from the repository itself rather
than retyped here, so this cannot get out of sync with what ships. The tables are
vacuumed and analysed first, and each plan is the second of two runs, so neither a
cold cache nor a missing visibility map is what gets measured.

| scenario | ms | pages | whole table read | indexes used |
| --- | ---: | ---: | --- | --- |
| a broad keyword, no Category | 4.76 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a narrow keyword, no Category | 1.93 | 557 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| two keywords, no Category | 2.17 | 334 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword and a common Tag | 4.80 | 1081 | no | "question_tags_tagId_questionId_idx", "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword and a rare Tag | 1.79 | 898 | no | "question_tags_tagId_questionId_idx", question_tags_pkey, questions_pkey |
| a narrow keyword and a common Tag | 1.94 | 1299 | no | "question_tags_tagId_questionId_idx", "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword and two Categories | 5.85 | 1122 | no | "question_tags_tagId_questionId_idx", "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, a deep page | 5.67 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, as the Author | 4.38 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |
| a broad keyword, as a Reviewer | 4.44 | 1052 | no | "questions_searchVector_idx", question_tags_pkey, questions_pkey |

## The plans

### a broad keyword, no Category

The keyword alone, matching about half the bank. The baseline every other plan is read against.

```
Nested Loop Left Join  (cost=6144.88..6857.37 rows=50 width=398) (actual time=3.403..4.617 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6137.45..6484.92 rows=50 width=366) (actual time=3.241..3.329 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6137.17..6137.29 rows=50 width=20) (actual time=3.221..3.228 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6137.17..6148.24 rows=4428 width=20) (actual time=3.220..3.223 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5990.07 rows=4428 width=20) (actual time=0.416..2.716 rows=4933 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.346..0.346 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.002..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.001..0.001 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.025..0.025 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.014..0.020 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.009..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.442 ms
Execution Time: 4.756 ms
```

### a narrow keyword, no Category

The same query aimed at one Question in fifty. The planner should not answer it the same way.

```
Nested Loop Left Join  (cost=57.98..129.09 rows=5 width=398) (actual time=0.438..1.776 rows=50 loops=1)
  Buffers: shared hit=557
  ->  Nested Loop  (cost=50.55..91.84 rows=5 width=366) (actual time=0.375..0.471 rows=50 loops=1)
        Buffers: shared hit=355
        ->  Limit  (cost=50.26..50.28 rows=5 width=20) (actual time=0.363..0.371 rows=50 loops=1)
              Buffers: shared hit=205
              ->  Sort  (cost=50.26..50.28 rows=5 width=20) (actual time=0.362..0.366 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''ubiquit'' & ''languag'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 30kB
                    Buffers: shared hit=205
                    ->  Bitmap Heap Scan on questions q_1  (cost=21.49..50.21 rows=5 width=20) (actual time=0.064..0.313 rows=247 loops=1)
                          Recheck Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=199
                          Buffers: shared hit=205
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..21.49 rows=6 width=0) (actual time=0.040..0.040 rows=247 loops=1)
                                Index Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                Buffers: shared hit=5
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                                  Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.026..0.026 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.013..0.019 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.014 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.008 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.585 ms
Execution Time: 1.927 ms
```

### two keywords, no Category

Two words are AND-ed, which reaches a smaller part of the bank than either word alone.

```
Nested Loop Left Join  (cost=244.74..890.41 rows=45 width=398) (actual time=0.325..1.999 rows=41 loops=1)
  Buffers: shared hit=334
  ->  Nested Loop  (cost=237.31..555.20 rows=45 width=366) (actual time=0.237..0.386 rows=41 loops=1)
        Buffers: shared hit=168
        ->  Limit  (cost=237.03..237.14 rows=45 width=20) (actual time=0.223..0.233 rows=41 loops=1)
              Buffers: shared hit=45
              ->  Sort  (cost=237.03..237.14 rows=45 width=20) (actual time=0.222..0.227 rows=41 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''migrat'' & ''deadlock'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 27kB
                    Buffers: shared hit=45
                    ->  Bitmap Heap Scan on questions q_1  (cost=21.72..235.79 rows=45 width=20) (actual time=0.117..0.199 rows=41 loops=1)
                          Recheck Cond: ("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=39
                          Buffers: shared hit=45
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..21.71 rows=51 width=0) (actual time=0.103..0.104 rows=41 loops=1)
                                Index Cond: ("searchVector" @@ '''migrat'' & ''deadlock'''::tsquery)
                                Buffers: shared hit=5
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=1)
                                  Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..7.06 rows=1 width=362) (actual time=0.003..0.003 rows=1 loops=41)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=123
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.039..0.039 rows=1 loops=41)
        Buffers: shared hit=166
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.021..0.031 rows=4 loops=41)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=166
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.014..0.023 rows=4 loops=41)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=165
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.005 rows=61 loops=41)
                          Buffers: shared hit=41
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.010..0.010 rows=4 loops=41)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=124
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.004..0.004 rows=4 loops=41)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=124
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.010 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.723 ms
Execution Time: 2.172 ms
```

### a broad keyword and a common Tag

The combined query this ticket exists for: the keyword index and the Tag index are both usable, and the planner has to choose.

```
Nested Loop Left Join  (cost=6248.45..6960.94 rows=50 width=398) (actual time=3.532..4.640 rows=50 loops=1)
  Buffers: shared hit=1081
  ->  Nested Loop  (cost=6241.02..6588.48 rows=50 width=366) (actual time=3.467..3.563 rows=50 loops=1)
        Buffers: shared hit=879
        ->  Limit  (cost=6240.73..6240.86 rows=50 width=20) (actual time=3.444..3.451 rows=50 loops=1)
              Buffers: shared hit=729
              ->  Sort  (cost=6240.73..6243.98 rows=1298 width=20) (actual time=3.443..3.447 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=729
                    ->  Hash Semi Join  (cost=227.12..6197.61 rows=1298 width=20) (actual time=1.022..3.239 rows=1474 loops=1)
                          Hash Cond: (q_1.id = qt."questionId")
                          Buffers: shared hit=729
                          ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5979.00 rows=4428 width=274) (actual time=0.410..1.854 rows=4933 loops=1)
                                Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Heap Blocks: exact=695
                                Buffers: shared hit=700
                                ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.334..0.335 rows=4933 loops=1)
                                      Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Buffers: shared hit=4
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.007..0.008 rows=1 loops=1)
                                        Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
                          ->  Hash  (cost=147.76..147.76 rows=2934 width=16) (actual time=0.594..0.594 rows=2962 loops=1)
                                Buckets: 4096  Batches: 1  Memory Usage: 171kB
                                Buffers: shared hit=29
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..147.76 rows=2934 width=16) (actual time=0.015..0.275 rows=2962 loops=1)
                                      Index Cond: ("tagId" = ANY ('{513b2719-b16b-4dee-be47-69010879d550}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=29
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.021..0.021 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.011..0.017 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.007..0.012 rows=5 loops=50)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.009 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.004 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=49
Planning Time: 0.634 ms
Execution Time: 4.800 ms
```

### a broad keyword and a rare Tag

The same pair with the selective half swapped onto the Tag, which is where driving from question_tags should start to win.

```
Nested Loop Left Join  (cost=1115.48..1827.97 rows=50 width=398) (actual time=0.453..1.678 rows=50 loops=1)
  Buffers: shared hit=898
  ->  Nested Loop  (cost=1108.05..1455.51 rows=50 width=366) (actual time=0.402..0.485 rows=50 loops=1)
        Buffers: shared hit=696
        ->  Limit  (cost=1107.76..1107.89 rows=50 width=20) (actual time=0.395..0.402 rows=50 loops=1)
              Buffers: shared hit=546
              ->  Sort  (cost=1107.76..1107.97 rows=82 width=20) (actual time=0.394..0.398 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 31kB
                    Buffers: shared hit=546
                    ->  Nested Loop  (cost=12.42..1105.15 rows=82 width=20) (actual time=0.061..0.372 rows=90 loops=1)
                          Buffers: shared hit=546
                          ->  HashAggregate  (cost=12.13..13.98 rows=185 width=16) (actual time=0.050..0.063 rows=180 loops=1)
                                Group Key: qt."questionId"
                                Batches: 1  Memory Usage: 40kB
                                Buffers: shared hit=5
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..11.67 rows=186 width=16) (actual time=0.012..0.025 rows=180 loops=1)
                                      Index Cond: ("tagId" = ANY ('{2f6ef84a-27f7-4cdc-b8a1-fd29a122a56e}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=5
                          ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..5.98 rows=1 width=274) (actual time=0.001..0.001 rows=0 loops=180)
                                Index Cond: (id = qt."questionId")
                                Filter: (("searchVector" @@ '''test'''::tsquery) AND (("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Rows Removed by Filter: 0
                                Buffers: shared hit=541
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                        Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.001..0.001 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.023..0.023 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.017 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=5 loops=50)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.008 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.001..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=49
Planning Time: 0.583 ms
Execution Time: 1.790 ms
```

### a narrow keyword and a common Tag

Selective on the keyword instead, so the two indexes swap roles.

```
Nested Loop Left Join  (cost=80.11..88.16 rows=1 width=398) (actual time=0.672..1.826 rows=50 loops=1)
  Buffers: shared hit=1299
  ->  Nested Loop  (cost=72.68..80.71 rows=1 width=366) (actual time=0.623..0.707 rows=50 loops=1)
        Buffers: shared hit=1097
        ->  Limit  (cost=72.39..72.40 rows=1 width=20) (actual time=0.614..0.620 rows=50 loops=1)
              Buffers: shared hit=947
              ->  Sort  (cost=72.39..72.40 rows=1 width=20) (actual time=0.613..0.617 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''ubiquit'' & ''languag'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: quicksort  Memory: 29kB
                    Buffers: shared hit=947
                    ->  Nested Loop Semi Join  (cost=21.91..72.38 rows=1 width=20) (actual time=0.066..0.596 rows=61 loops=1)
                          Buffers: shared hit=947
                          ->  Bitmap Heap Scan on questions q_1  (cost=21.49..50.19 rows=5 width=274) (actual time=0.052..0.251 rows=247 loops=1)
                                Recheck Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                Heap Blocks: exact=199
                                Buffers: shared hit=205
                                ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..21.49 rows=6 width=0) (actual time=0.036..0.037 rows=247 loops=1)
                                      Index Cond: ("searchVector" @@ '''ubiquit'' & ''languag'''::tsquery)
                                      Buffers: shared hit=5
                                SubPlan 2
                                  ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.002..0.002 rows=1 loops=1)
                                        Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                        Rows Removed by Filter: 2
                                        Buffers: shared hit=1
                          ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..4.43 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=247)
                                Index Cond: (("tagId" = ANY ('{513b2719-b16b-4dee-be47-69010879d550}'::uuid[])) AND ("questionId" = q_1.id))
                                Heap Fetches: 0
                                Buffers: shared hit=742
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=362) (actual time=0.001..0.001 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.022..0.022 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.017 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.013 rows=5 loops=50)
                    Hash Cond: (t.id = qt_1."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.002..0.002 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.007 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.001..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=49
Planning Time: 0.567 ms
Execution Time: 1.939 ms
```

### a broad keyword and two Categories

One EXISTS per Category is the shape ADR-0011 chose; this is that shape with the search on top of it.

```
Nested Loop Left Join  (cost=6544.22..7256.72 rows=50 width=398) (actual time=4.544..5.649 rows=50 loops=1)
  Buffers: shared hit=1122
  ->  Nested Loop  (cost=6536.79..6884.26 rows=50 width=366) (actual time=4.477..4.570 rows=50 loops=1)
        Buffers: shared hit=920
        ->  Limit  (cost=6536.51..6536.63 rows=50 width=20) (actual time=4.460..4.467 rows=50 loops=1)
              Buffers: shared hit=770
              ->  Sort  (cost=6536.51..6538.10 rows=635 width=20) (actual time=4.459..4.463 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=770
                    ->  Hash Semi Join  (cost=533.73..6515.41 rows=635 width=20) (actual time=1.993..4.351 rows=702 loops=1)
                          Hash Cond: (qt."questionId" = qt_1."questionId")
                          Buffers: shared hit=770
                          ->  Hash Semi Join  (cost=227.12..6194.37 rows=1298 width=290) (actual time=0.964..3.041 rows=1474 loops=1)
                                Hash Cond: (q_1.id = qt."questionId")
                                Buffers: shared hit=729
                                ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5979.00 rows=4428 width=274) (actual time=0.383..1.818 rows=4933 loops=1)
                                      Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                                      Heap Blocks: exact=695
                                      Buffers: shared hit=700
                                      ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.307..0.308 rows=4933 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                      SubPlan 2
                                        ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                              Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                              Rows Removed by Filter: 2
                                              Buffers: shared hit=1
                                ->  Hash  (cost=147.76..147.76 rows=2934 width=16) (actual time=0.567..0.567 rows=2962 loops=1)
                                      Buckets: 4096  Batches: 1  Memory Usage: 171kB
                                      Buffers: shared hit=29
                                      ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..147.76 rows=2934 width=16) (actual time=0.015..0.266 rows=2962 loops=1)
                                            Index Cond: ("tagId" = ANY ('{513b2719-b16b-4dee-be47-69010879d550}'::uuid[]))
                                            Heap Fetches: 0
                                            Buffers: shared hit=29
                          ->  Hash  (cost=245.69..245.69 rows=4873 width=16) (actual time=0.998..0.998 rows=4826 loops=1)
                                Buckets: 8192  Batches: 1  Memory Usage: 291kB
                                Buffers: shared hit=41
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt_1  (cost=0.41..245.69 rows=4873 width=16) (actual time=0.014..0.393 rows=4826 loops=1)
                                      Index Cond: ("tagId" = ANY ('{d5c73bfc-ba19-46f7-a7c4-10edd51f6fca}'::uuid[]))
                                      Heap Fetches: 0
                                      Buffers: shared hit=41
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.021..0.021 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.011..0.017 rows=5 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.007..0.012 rows=5 loops=50)
                    Hash Cond: (t.id = qt_2."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=5 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt_2  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=5 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.007 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=109
Planning Time: 0.853 ms
Execution Time: 5.846 ms
```

### a broad keyword, a deep page

Where the limit-and-offset ceiling sits: the skipped rows still have to be produced and thrown away.

```
Nested Loop Left Join  (cost=6268.50..6980.99 rows=50 width=398) (actual time=4.423..5.537 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6261.07..6608.53 rows=50 width=366) (actual time=4.365..4.460 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6260.78..6260.91 rows=50 width=20) (actual time=4.351..4.357 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6255.78..6266.85 rows=4428 width=20) (actual time=4.242..4.305 rows=2050 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 436kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5990.07 rows=4428 width=20) (actual time=0.377..2.622 rows=4933 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.312..0.312 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = 'ded747a1-165d-4825-9486-1ed47c24e70f'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.021..0.021 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.017 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.007..0.012 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.002 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.008..0.008 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.411 ms
Execution Time: 5.672 ms
```

### a broad keyword, as the Author

The second check becomes published OR authored by this Viewer, and the Author wrote the whole bulk bank.

```
Nested Loop Left Join  (cost=6144.99..6857.48 rows=50 width=398) (actual time=3.084..4.274 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6137.56..6485.03 rows=50 width=366) (actual time=3.019..3.115 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6137.27..6137.40 rows=50 width=20) (actual time=3.002..3.026 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6137.27..6148.35 rows=4431 width=20) (actual time=3.001..3.005 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5990.08 rows=4431 width=20) (actual time=0.411..2.528 rows=4933 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: ((("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40d175c8-439c-469a-81ef-bebf2c5294b8'::uuid)) AND (("clientId" IS NULL) OR (hashed SubPlan 2)))
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.335..0.336 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = '40d175c8-439c-469a-81ef-bebf2c5294b8'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.001..0.001 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.023..0.023 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.012..0.018 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.007..0.013 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.007 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.431 ms
Execution Time: 4.378 ms
```

### a broad keyword, as a Reviewer

A Reviewer drops the second check entirely (ADR-0013), so this is the widest the query ever gets.

```
Nested Loop Left Join  (cost=6120.32..6832.82 rows=50 width=398) (actual time=2.976..4.279 rows=50 loops=1)
  Buffers: shared hit=1052
  ->  Nested Loop  (cost=6112.89..6460.36 rows=50 width=366) (actual time=2.891..3.017 rows=50 loops=1)
        Buffers: shared hit=850
        ->  Limit  (cost=6112.61..6112.73 rows=50 width=20) (actual time=2.858..2.869 rows=50 loops=1)
              Buffers: shared hit=700
              ->  Sort  (cost=6112.61..6123.69 rows=4431 width=20) (actual time=2.856..2.864 rows=50 loops=1)
                    Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                    Sort Method: top-N heapsort  Memory: 31kB
                    Buffers: shared hit=700
                    ->  Bitmap Heap Scan on questions q_1  (cost=42.69..5965.42 rows=4431 width=20) (actual time=0.362..2.453 rows=3928 loops=1)
                          Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                          Filter: (("clientId" IS NULL) OR (hashed SubPlan 2))
                          Rows Removed by Filter: 1005
                          Heap Blocks: exact=695
                          Buffers: shared hit=700
                          ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.295..0.297 rows=4933 loops=1)
                                Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                Buffers: shared hit=4
                          SubPlan 2
                            ->  Seq Scan on permission_grants g  (cost=0.00..1.04 rows=1 width=16) (actual time=0.002..0.003 rows=1 loops=1)
                                  Filter: ("viewerId" = 'a8f72236-3719-48d7-a842-2b49e52d43c4'::uuid)
                                  Rows Removed by Filter: 2
                                  Buffers: shared hit=1
        ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=50)
              Index Cond: (id = q_1.id)
              Buffers: shared hit=150
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.025..0.025 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.014..0.020 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.008..0.014 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.006..0.006 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.001..0.002 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.011..0.012 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.004..0.005 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=21
Planning Time: 0.453 ms
Execution Time: 4.441 ms
```
