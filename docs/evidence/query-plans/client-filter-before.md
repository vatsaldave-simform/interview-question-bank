# Query plans at 10,010 Questions

Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the
deployment: free-tier compute is throttled and shared, so a timing taken there measures
the host's spare capacity rather than the indexing decision it is meant to defend
(ADR-0012).

Measured at 2026-11-02T13:15:20.177Z against PostgreSQL 16.15.

Every statement is the one the client sends, taken from the repository itself rather
than retyped here, so this cannot get out of sync with what ships. The tables are
vacuumed and analysed first, and each plan is the second of two runs, so neither a
cold cache nor a missing visibility map is what gets measured.

| scenario | ms | pages | whole table read | indexes used |
| --- | ---: | ---: | --- | --- |
| a common Client | 2.44 | 1397 | no | "questions_createdAt_id_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a rare Client | 5.24 | 1407 | **yes** | clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a Client on a handful of Questions | 0.76 | 118 | no | clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| two Clients | 3.75 | 986 | no | "questions_createdAt_id_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a common Client and a common Tag | 3.68 | 3124 | no | "question_tags_tagId_questionId_idx", "questions_createdAt_id_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a common Client and a broad keyword | 6.12 | 1407 | no | "questions_searchVector_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |
| a rare Client and a broad keyword | 4.87 | 1409 | no | "questions_searchVector_idx", clients_pkey, question_clients_pkey, question_tags_pkey, questions_pkey |

## The plans

### a common Client

Matches much of the bank, so walking the newest-first index fills a page quickly. The baseline every other plan is read against.

```
Sort  (cost=1915.07..1915.19 rows=50 width=410) (actual time=2.317..2.321 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 58kB
  Buffers: shared hit=1397
  ->  Nested Loop Left Join  (cost=28.98..1913.66 rows=50 width=410) (actual time=0.120..2.280 rows=50 loops=1)
        Buffers: shared hit=1397
        ->  Nested Loop Left Join  (cost=21.55..1541.20 rows=50 width=378) (actual time=0.069..1.208 rows=50 loops=1)
              Buffers: shared hit=1195
              ->  Nested Loop  (cost=0.86..505.25 rows=50 width=346) (actual time=0.040..0.563 rows=50 loops=1)
                    Buffers: shared hit=898
                    ->  Limit  (cost=0.57..157.62 rows=50 width=24) (actual time=0.032..0.480 rows=50 loops=1)
                          Buffers: shared hit=748
                          ->  Nested Loop Semi Join  (cost=0.57..6640.74 rows=2114 width=24) (actual time=0.031..0.471 rows=50 loops=1)
                                Buffers: shared hit=748
                                ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..3224.38 rows=10004 width=24) (actual time=0.011..0.163 rows=249 loops=1)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Rows Removed by Filter: 6
                                      Buffers: shared hit=249
                                ->  Index Only Scan using question_clients_pkey on question_clients qc  (cost=0.29..0.34 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=249)
                                      Index Cond: (("questionId" = q_1.id) AND ("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98}'::uuid[])))
                                      Heap Fetches: 0
                                      Buffers: shared hit=499
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.001..0.001 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.013..0.013 rows=1 loops=50)
                    Buffers: shared hit=297
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.006..0.007 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=297
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.002..0.003 rows=2 loops=50)
                                Buffers: shared hit=297
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.001..0.001 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.000..0.000 rows=1 loops=98)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=196
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.021..0.021 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.011..0.017 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.007..0.012 rows=4 loops=50)
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
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.007 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.003 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.589 ms
Execution Time: 2.440 ms
```

### a rare Client

Matches little of the bank, so walking newest first checks many Questions per match. This is where starting from question_clients should win, if an index lets it.

```
Sort  (cost=2832.49..2832.61 rows=50 width=410) (actual time=5.068..5.078 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 57kB
  Buffers: shared hit=1407
  ->  Nested Loop Left Join  (cost=1103.33..2831.08 rows=50 width=410) (actual time=3.278..5.033 rows=50 loops=1)
        Buffers: shared hit=1407
        ->  Nested Loop Left Join  (cost=1095.90..2458.62 rows=50 width=378) (actual time=3.212..3.721 rows=50 loops=1)
              Buffers: shared hit=1205
              ->  Nested Loop  (cost=1075.21..1422.67 rows=50 width=346) (actual time=3.165..3.309 rows=50 loops=1)
                    Buffers: shared hit=916
                    ->  Limit  (cost=1074.92..1075.05 rows=50 width=24) (actual time=3.141..3.151 rows=50 loops=1)
                          Buffers: shared hit=766
                          ->  Sort  (cost=1074.92..1075.44 rows=206 width=24) (actual time=3.139..3.145 rows=50 loops=1)
                                Sort Key: q_1."createdAt" DESC, q_1.id DESC
                                Sort Method: top-N heapsort  Memory: 30kB
                                Buffers: shared hit=766
                                ->  Hash Semi Join  (cost=201.86..1068.08 rows=206 width=24) (actual time=0.586..3.105 rows=206 loops=1)
                                      Hash Cond: (q_1.id = qc."questionId")
                                      Buffers: shared hit=766
                                      ->  Seq Scan on questions q_1  (cost=0.00..837.15 rows=10004 width=24) (actual time=0.006..2.014 rows=10004 loops=1)
                                            Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                            Rows Removed by Filter: 6
                                            Buffers: shared hit=687
                                      ->  Hash  (cost=199.28..199.28 rows=206 width=16) (actual time=0.511..0.511 rows=206 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 18kB
                                            Buffers: shared hit=79
                                            ->  Seq Scan on question_clients qc  (cost=0.00..199.28 rows=206 width=16) (actual time=0.014..0.479 rows=206 loops=1)
                                                  Filter: ("clientId" = ANY ('{f8d3234b-7ce0-4454-88ad-079934688d98}'::uuid[]))
                                                  Rows Removed by Filter: 10486
                                                  Buffers: shared hit=79
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.003..0.003 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.008..0.008 rows=1 loops=50)
                    Buffers: shared hit=289
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.005..0.005 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=289
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.003..0.004 rows=2 loops=50)
                                Buffers: shared hit=289
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.002..0.002 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=94)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=188
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.026..0.026 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.015..0.021 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.015 rows=4 loops=50)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=4 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.003 rows=4 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.011..0.011 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.004..0.005 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.631 ms
Execution Time: 5.235 ms
```

### a Client on a handful of Questions

The far end of the same line: so few matches that reading the whole join table is cheap however it is indexed.

```
Sort  (cost=378.59..378.60 rows=4 width=410) (actual time=0.639..0.642 rows=2 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 26kB
  Buffers: shared hit=118
  ->  Nested Loop Left Join  (cost=261.02..378.55 rows=4 width=410) (actual time=0.592..0.634 rows=2 loops=1)
        Buffers: shared hit=118
        ->  Nested Loop Left Join  (cost=253.60..348.75 rows=4 width=378) (actual time=0.542..0.562 rows=2 loops=1)
              Buffers: shared hit=108
              ->  Nested Loop  (cost=232.90..265.87 rows=4 width=346) (actual time=0.507..0.511 rows=2 loops=1)
                    Buffers: shared hit=97
                    ->  Limit  (cost=232.61..232.62 rows=4 width=24) (actual time=0.502..0.503 rows=2 loops=1)
                          Buffers: shared hit=91
                          ->  Sort  (cost=232.61..232.62 rows=4 width=24) (actual time=0.501..0.502 rows=2 loops=1)
                                Sort Key: q_1."createdAt" DESC, q_1.id DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=91
                                ->  Nested Loop  (cost=199.58..232.57 rows=4 width=24) (actual time=0.494..0.496 rows=2 loops=1)
                                      Buffers: shared hit=91
                                      ->  HashAggregate  (cost=199.29..199.33 rows=4 width=16) (actual time=0.476..0.477 rows=4 loops=1)
                                            Group Key: qc."questionId"
                                            Batches: 1  Memory Usage: 24kB
                                            Buffers: shared hit=79
                                            ->  Seq Scan on question_clients qc  (cost=0.00..199.28 rows=4 width=16) (actual time=0.005..0.472 rows=4 loops=1)
                                                  Filter: ("clientId" = ANY ('{568712a6-4131-491f-8ba1-9d907ea3f480}'::uuid[]))
                                                  Rows Removed by Filter: 10688
                                                  Buffers: shared hit=79
                                      ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..8.31 rows=1 width=24) (actual time=0.004..0.004 rows=0 loops=4)
                                            Index Cond: (id = qc."questionId")
                                            Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                            Rows Removed by Filter: 0
                                            Buffers: shared hit=12
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..8.30 rows=1 width=346) (actual time=0.003..0.003 rows=1 loops=2)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=6
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.024..0.025 rows=1 loops=2)
                    Buffers: shared hit=11
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.015..0.015 rows=2 loops=2)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=11
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.009..0.009 rows=2 loops=2)
                                Buffers: shared hit=11
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.005..0.005 rows=2 loops=2)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=5
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.002..0.002 rows=1 loops=3)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=6
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.035..0.035 rows=1 loops=2)
              Buffers: shared hit=10
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.024..0.030 rows=3 loops=2)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=10
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.015..0.021 rows=3 loops=2)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=9
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.003 rows=61 loops=2)
                                Buffers: shared hit=2
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.011..0.011 rows=3 loops=2)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=7
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.007..0.007 rows=3 loops=2)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=7
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.007 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.002..0.002 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 0.588 ms
Execution Time: 0.761 ms
```

### two Clients

Two Clients OR-ed inside one EXISTS, as two Tags of one Category are.

```
Sort  (cost=1840.71..1840.84 rows=50 width=410) (actual time=3.598..3.604 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 57kB
  Buffers: shared hit=986
  ->  Nested Loop Left Join  (cost=28.98..1839.30 rows=50 width=410) (actual time=0.391..3.535 rows=50 loops=1)
        Buffers: shared hit=986
        ->  Nested Loop Left Join  (cost=21.55..1466.84 rows=50 width=378) (actual time=0.253..1.436 rows=50 loops=1)
              Buffers: shared hit=784
              ->  Nested Loop  (cost=0.86..430.89 rows=50 width=346) (actual time=0.089..0.888 rows=50 loops=1)
                    Buffers: shared hit=513
                    ->  Limit  (cost=0.57..83.27 rows=50 width=24) (actual time=0.061..0.671 rows=50 loops=1)
                          Buffers: shared hit=363
                          ->  Nested Loop Semi Join  (cost=0.57..6861.16 rows=4148 width=24) (actual time=0.060..0.665 rows=50 loops=1)
                                Buffers: shared hit=363
                                ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..3224.38 rows=10004 width=24) (actual time=0.029..0.269 rows=121 loops=1)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Rows Removed by Filter: 6
                                      Buffers: shared hit=120
                                ->  Index Only Scan using question_clients_pkey on question_clients qc  (cost=0.29..0.36 rows=1 width=16) (actual time=0.003..0.003 rows=0 loops=121)
                                      Index Cond: ("questionId" = q_1.id)
                                      Filter: ("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98,95910676-9c4c-4ae5-889d-4f58ab68dc69}'::uuid[]))
                                      Rows Removed by Filter: 1
                                      Heap Fetches: 0
                                      Buffers: shared hit=243
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.004..0.004 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.010..0.010 rows=1 loops=50)
                    Buffers: shared hit=271
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.006..0.006 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=271
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.003..0.004 rows=2 loops=50)
                                Buffers: shared hit=271
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.001..0.001 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=85)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=170
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.041..0.041 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.023..0.036 rows=4 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.014..0.026 rows=4 loops=50)
                          Hash Cond: (t.id = qt."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.001..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.011..0.011 rows=4 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.005..0.005 rows=4 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.027..0.027 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.017..0.019 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=44
Planning Time: 1.408 ms
Execution Time: 3.752 ms
```

### a common Client and a common Tag

One EXISTS for the Client beside one for the Category, the shape ADR-0011 chose.

```
Sort  (cost=2386.26..2386.39 rows=50 width=410) (actual time=3.490..3.498 rows=50 loops=1)
  Sort Key: q."createdAt" DESC, q.id DESC
  Sort Method: quicksort  Memory: 58kB
  Buffers: shared hit=3124
  ->  Nested Loop Left Join  (cost=29.40..2384.85 rows=50 width=410) (actual time=0.171..3.445 rows=50 loops=1)
        Buffers: shared hit=3124
        ->  Nested Loop Left Join  (cost=21.97..2012.39 rows=50 width=378) (actual time=0.122..2.138 rows=50 loops=1)
              Buffers: shared hit=2922
              ->  Nested Loop  (cost=1.27..976.44 rows=50 width=346) (actual time=0.091..1.801 rows=50 loops=1)
                    Buffers: shared hit=2633
                    ->  Limit  (cost=0.99..628.82 rows=50 width=24) (actual time=0.084..1.670 rows=50 loops=1)
                          Buffers: shared hit=2483
                          ->  Nested Loop Semi Join  (cost=0.99..7848.88 rows=625 width=24) (actual time=0.083..1.665 rows=50 loops=1)
                                Buffers: shared hit=2483
                                ->  Nested Loop Semi Join  (cost=0.57..6640.74 rows=2114 width=40) (actual time=0.034..1.425 rows=142 loops=1)
                                      Buffers: shared hit=2056
                                      ->  Index Scan using "questions_createdAt_id_idx" on questions q_1  (cost=0.29..3224.38 rows=10004 width=24) (actual time=0.012..0.593 rows=684 loops=1)
                                            Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                            Rows Removed by Filter: 6
                                            Buffers: shared hit=687
                                      ->  Index Only Scan using question_clients_pkey on question_clients qc  (cost=0.29..0.34 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=684)
                                            Index Cond: (("questionId" = q_1.id) AND ("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98}'::uuid[])))
                                            Heap Fetches: 0
                                            Buffers: shared hit=1369
                                ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags qt  (cost=0.41..0.57 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=142)
                                      Index Cond: (("tagId" = ANY ('{64aa4812-a331-4564-b807-9afb759ca0ec}'::uuid[])) AND ("questionId" = q_1.id))
                                      Heap Fetches: 0
                                      Buffers: shared hit=427
                    ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.002..0.002 rows=1 loops=50)
                          Index Cond: (id = q_1.id)
                          Buffers: shared hit=150
              ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.006..0.006 rows=1 loops=50)
                    Buffers: shared hit=289
                    ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.004..0.004 rows=2 loops=50)
                          Sort Key: cl.name
                          Sort Method: quicksort  Memory: 25kB
                          Buffers: shared hit=289
                          ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.002..0.002 rows=2 loops=50)
                                Buffers: shared hit=289
                                ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.001..0.001 rows=2 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=101
                                ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=94)
                                      Index Cond: (id = qc_1."clientId")
                                      Buffers: shared hit=188
        ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.026..0.026 rows=1 loops=50)
              Buffers: shared hit=202
              ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.015..0.021 rows=5 loops=50)
                    Hash Cond: (t."categoryId" = c.id)
                    Buffers: shared hit=202
                    ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.010..0.015 rows=5 loops=50)
                          Hash Cond: (t.id = qt_1."tagId")
                          Buffers: shared hit=201
                          ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                                Buffers: shared hit=50
                          ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=5 loops=50)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=151
                                ->  Index Only Scan using question_tags_pkey on question_tags qt_1  (cost=0.41..4.49 rows=4 width=16) (actual time=0.003..0.003 rows=5 loops=50)
                                      Index Cond: ("questionId" = q.id)
                                      Heap Fetches: 0
                                      Buffers: shared hit=151
                    ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.007..0.008 rows=3 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.003..0.003 rows=3 loops=1)
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=100
Planning Time: 0.942 ms
Execution Time: 3.678 ms
```

### a common Client and a broad keyword

The search index and the Client filter can each drive the query, and the planner has to choose, as ADR-0029 found for a Tag.

```
Nested Loop Left Join  (cost=1134.64..2862.38 rows=50 width=414) (actual time=4.107..5.840 rows=50 loops=1)
  Buffers: shared hit=1407
  ->  Nested Loop Left Join  (cost=1127.21..2489.93 rows=50 width=382) (actual time=4.013..4.508 rows=50 loops=1)
        Buffers: shared hit=1205
        ->  Nested Loop  (cost=1106.51..1453.97 rows=50 width=350) (actual time=3.929..4.079 rows=50 loops=1)
              Buffers: shared hit=920
              ->  Limit  (cost=1106.22..1106.35 rows=50 width=20) (actual time=3.863..3.872 rows=50 loops=1)
                    Buffers: shared hit=770
                    ->  Sort  (cost=1106.22..1108.83 rows=1042 width=20) (actual time=3.861..3.866 rows=50 loops=1)
                          Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                          Sort Method: top-N heapsort  Memory: 30kB
                          Buffers: shared hit=770
                          ->  Hash Semi Join  (cost=268.54..1071.61 rows=1042 width=20) (actual time=1.209..3.721 rows=1034 loops=1)
                                Hash Cond: (q_1.id = qc."questionId")
                                Buffers: shared hit=770
                                ->  Bitmap Heap Scan on questions q_1  (cost=42.81..816.14 rows=4930 width=274) (actual time=0.428..2.245 rows=4933 loops=1)
                                      Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Heap Blocks: exact=687
                                      Buffers: shared hit=691
                                      ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.371..0.372 rows=4933 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                ->  Hash  (cost=199.28..199.28 rows=2115 width=16) (actual time=0.764..0.765 rows=2115 loops=1)
                                      Buckets: 4096  Batches: 1  Memory Usage: 132kB
                                      Buffers: shared hit=79
                                      ->  Seq Scan on question_clients qc  (cost=0.00..199.28 rows=2115 width=16) (actual time=0.004..0.544 rows=2115 loops=1)
                                            Filter: ("clientId" = ANY ('{c1e5a8b9-c5d5-416f-a8af-350f6e797c98}'::uuid[]))
                                            Rows Removed by Filter: 8577
                                            Buffers: shared hit=79
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.003..0.003 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.008..0.008 rows=1 loops=50)
              Buffers: shared hit=285
              ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.005..0.005 rows=2 loops=50)
                    Sort Key: cl.name
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=285
                    ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.003..0.004 rows=2 loops=50)
                          Buffers: shared hit=285
                          ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.002..0.002 rows=2 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=101
                          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=92)
                                Index Cond: (id = qc_1."clientId")
                                Buffers: shared hit=184
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.026..0.026 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.016..0.022 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.016 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.008..0.008 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.004..0.004 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.017..0.017 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.010..0.011 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=45
Planning Time: 0.674 ms
Execution Time: 6.116 ms
```

### a rare Client and a broad keyword

The same pair with the selective half moved onto the Client.

```
Nested Loop Left Join  (cost=1064.34..2792.09 rows=50 width=414) (actual time=2.802..4.718 rows=50 loops=1)
  Buffers: shared hit=1409
  ->  Nested Loop Left Join  (cost=1056.91..2419.63 rows=50 width=382) (actual time=2.716..3.321 rows=50 loops=1)
        Buffers: shared hit=1207
        ->  Nested Loop  (cost=1036.21..1383.68 rows=50 width=350) (actual time=2.644..2.857 rows=50 loops=1)
              Buffers: shared hit=920
              ->  Limit  (cost=1035.93..1036.05 rows=50 width=20) (actual time=2.603..2.613 rows=50 loops=1)
                    Buffers: shared hit=770
                    ->  Sort  (cost=1035.93..1036.18 rows=101 width=20) (actual time=2.601..2.609 rows=50 loops=1)
                          Sort Key: (ts_rank(q_1."searchVector", '''test'''::tsquery)) DESC, q_1.id DESC
                          Sort Method: quicksort  Memory: 31kB
                          Buffers: shared hit=770
                          ->  Hash Semi Join  (cost=244.67..1032.57 rows=101 width=20) (actual time=0.959..2.575 rows=96 loops=1)
                                Hash Cond: (q_1.id = qc."questionId")
                                Buffers: shared hit=770
                                ->  Bitmap Heap Scan on questions q_1  (cost=42.81..816.14 rows=4930 width=274) (actual time=0.415..1.778 rows=4933 loops=1)
                                      Recheck Cond: ("searchVector" @@ '''test'''::tsquery)
                                      Filter: (("publicationState" = 'published'::"PublicationState") OR ("authorId" = '40fea4c5-e374-481e-af11-d0db670d3060'::uuid))
                                      Heap Blocks: exact=687
                                      Buffers: shared hit=691
                                      ->  Bitmap Index Scan on "questions_searchVector_idx"  (cost=0.00..41.58 rows=4933 width=0) (actual time=0.353..0.353 rows=4933 loops=1)
                                            Index Cond: ("searchVector" @@ '''test'''::tsquery)
                                            Buffers: shared hit=4
                                ->  Hash  (cost=199.28..199.28 rows=206 width=16) (actual time=0.496..0.497 rows=206 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 18kB
                                      Buffers: shared hit=79
                                      ->  Seq Scan on question_clients qc  (cost=0.00..199.28 rows=206 width=16) (actual time=0.013..0.469 rows=206 loops=1)
                                            Filter: ("clientId" = ANY ('{f8d3234b-7ce0-4454-88ad-079934688d98}'::uuid[]))
                                            Rows Removed by Filter: 10486
                                            Buffers: shared hit=79
              ->  Index Scan using questions_pkey on questions q  (cost=0.29..6.94 rows=1 width=346) (actual time=0.004..0.004 rows=1 loops=50)
                    Index Cond: (id = q_1.id)
                    Buffers: shared hit=150
        ->  Aggregate  (cost=20.70..20.71 rows=1 width=32) (actual time=0.009..0.009 rows=1 loops=50)
              Buffers: shared hit=287
              ->  Sort  (cost=20.68..20.69 rows=2 width=48) (actual time=0.006..0.006 rows=2 loops=50)
                    Sort Key: cl.name
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=287
                    ->  Nested Loop  (cost=0.44..20.67 rows=2 width=48) (actual time=0.004..0.005 rows=2 loops=50)
                          Buffers: shared hit=287
                          ->  Index Only Scan using question_clients_pkey on question_clients qc_1  (cost=0.29..4.32 rows=2 width=16) (actual time=0.003..0.003 rows=2 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=101
                          ->  Index Scan using clients_pkey on clients cl  (cost=0.15..8.17 rows=1 width=48) (actual time=0.001..0.001 rows=1 loops=93)
                                Index Cond: (id = qc_1."clientId")
                                Buffers: shared hit=186
  ->  Aggregate  (cost=7.43..7.44 rows=1 width=32) (actual time=0.027..0.027 rows=1 loops=50)
        Buffers: shared hit=202
        ->  Hash Join  (cost=5.60..7.41 rows=4 width=28) (actual time=0.017..0.023 rows=4 loops=50)
              Hash Cond: (t."categoryId" = c.id)
              Buffers: shared hit=202
              ->  Hash Join  (cost=4.54..6.32 rows=4 width=33) (actual time=0.011..0.016 rows=4 loops=50)
                    Hash Cond: (t.id = qt."tagId")
                    Buffers: shared hit=201
                    ->  Seq Scan on tags t  (cost=0.00..1.61 rows=61 width=49) (actual time=0.000..0.003 rows=61 loops=50)
                          Buffers: shared hit=50
                    ->  Hash  (cost=4.49..4.49 rows=4 width=16) (actual time=0.009..0.009 rows=4 loops=50)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=151
                          ->  Index Only Scan using question_tags_pkey on question_tags qt  (cost=0.41..4.49 rows=4 width=16) (actual time=0.004..0.004 rows=4 loops=50)
                                Index Cond: ("questionId" = q.id)
                                Heap Fetches: 0
                                Buffers: shared hit=151
              ->  Hash  (cost=1.03..1.03 rows=3 width=27) (actual time=0.010..0.011 rows=3 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on categories c  (cost=0.00..1.03 rows=3 width=27) (actual time=0.005..0.006 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=45
Planning Time: 0.607 ms
Execution Time: 4.874 ms
```
