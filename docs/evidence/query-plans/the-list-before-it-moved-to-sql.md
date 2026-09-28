# The list before it moved to SQL

Issue #59 moved the list from a Prisma `findMany` to one hand-written statement, so the
visibility check is written once. ADR-0011 chose the list's shape by measuring it, and the
ticket asks whether the rewrite changed the plan it chose. This file is the answer's
evidence. The plans after the move are in
[`the-list-at-ten-thousand-questions.md`](the-list-at-ten-thousand-questions.md).

## How this was taken, and why it cannot be taken again

The Prisma version is gone, so `pnpm db:measure:plans` cannot capture it. These plans were
taken once, from `main` at `ea44483`, before the move:

- The same bank as the plans after the move: `pnpm db:seed:bulk` into an empty
  database, 10,009 Questions, vacuumed and analysed, on PostgreSQL 16.15.
- The same scenarios, from `scenariosForTheList`.
- `main`'s own `findVisibleQuestions` was called with Prisma's query log on. Each
  statement it sent was run again under `EXPLAIN (ANALYZE, BUFFERS)` with the same
  values, twice, keeping the second run.

Prisma sends five statements per page: the page itself, then the page's Clients, its
Question-Tag rows, their Tags and their Categories, each looked up by id. Only the first
does any choosing, so only its plan is printed below. The table counts all five.

The time taken end to end is the median of 300 calls to `findVisibleQuestions` in a
row, after 30 to warm up, from Node on the same machine. It includes the round trips to
the database, which the plan times leave out. The new statement was timed twice, and the
two runs show how much this number moves between runs.

## Summary

| scenario | before: ms (5 statements) | before: pages | after: ms | after: pages | before: end to end, ms | after: end to end, ms (two runs) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| no Category | 0.60 | 242 | 2.01 | 438 | 5.6 | 4.5 / 3.7 |
| a common Tag | 0.78 | 800 | 2.65 | 995 | 6.7 | 5.0 / 4.5 |
| a rare Tag | 0.98 | 701 | 3.02 | 924 | 6.2 | 4.5 / 4.4 |
| two Categories | 1.99 | 1627 | 4.24 | 1822 | 7.0 | 6.0 / 5.5 |
| a common Tag, a deep page | 14.36 | 876 | 9.28 | 9288 | 14.5 | 14.7 / 11.2 |
| no Category, as the Author | 0.75 | 242 | 2.05 | 434 | 4.4 | 3.7 / 4.0 |
| no Category, as a Reviewer | 0.63 | 272 | 2.01 | 425 | 4.4 | 3.7 / 4.9 |

**The page is chosen the same way.** In every scenario but the deep page, both versions walk
`questions (createdAt DESC, id DESC)` and stop once the page is full, or drive from
`question_tags (tagId, questionId)` when the Tag is rare. The part of the new plan that
picks the page reads fewer pages than Prisma's whole page statement did.

**The deep page drives from `question_tags` in both.** That is the strategy ADR-0011
found the planner takes when the page is deep. The new statement takes it the way ADR-0011
describes: gather the matching ids from `question_tags`, look each one up, and sort. Prisma's
statement joined those ids against a read of the whole questions table instead. The new one
touches more pages, 9,288 against 876, and takes less time, 9.3ms against 14.4ms.

**The new statement costs more in the database and less end to end.** It reads the page's
Clients and Tags inside the same statement, one row at a time, which is one to two
milliseconds and a few hundred pages more than Prisma's four lookups by id. It saves the
four round trips those lookups need. End to end it was faster in five scenarios on both
runs. For the deep page and the Reviewer, one run was faster and one was slower, by less
than the two runs differ from each other. This was against a database on the same
machine, where a round trip costs least.

## Prisma's page statement, per scenario

### no Category

```
Limit  (cost=0.44..87.69 rows=50 width=418) (actual time=0.049..0.149 rows=50 loops=1)
  Buffers: shared hit=88
  ->  Nested Loop Left Join  (cost=0.44..15670.73 rows=8980 width=418) (actual time=0.048..0.145 rows=50 loops=1)
        Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
        Rows Removed by Filter: 1
        Buffers: shared hit=88
        ->  Index Scan using "questions_createdAt_id_idx" on questions  (cost=0.29..3306.42 rows=10003 width=362) (actual time=0.020..0.079 rows=51 loops=1)
              Filter: (("publicationState" = ('published'::cstring)::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
              Rows Removed by Filter: 6
              Buffers: shared hit=51
        ->  Index Only Scan using clients_pkey on clients j0  (cost=0.15..0.17 rows=1 width=16) (actual time=0.000..0.001 rows=0 loops=51)
              Index Cond: (id = questions."clientId")
              Heap Fetches: 18
              Buffers: shared hit=36
        SubPlan 2
          ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=1)
                Filter: (("clientId" IS NOT NULL) AND ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                Rows Removed by Filter: 2
                Buffers: shared hit=1
Planning Time: 0.193 ms
Execution Time: 0.210 ms
```

### a common Tag

```
Limit  (cost=0.85..236.67 rows=50 width=418) (actual time=0.063..0.497 rows=50 loops=1)
  Buffers: shared hit=646
  ->  Nested Loop Left Join  (cost=0.85..12702.33 rows=2693 width=418) (actual time=0.062..0.492 rows=50 loops=1)
        Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
        Buffers: shared hit=646
        ->  Nested Loop  (cost=0.70..8994.58 rows=3000 width=362) (actual time=0.048..0.426 rows=50 loops=1)
              Buffers: shared hit=609
              ->  Index Scan using "questions_createdAt_id_idx" on questions  (cost=0.29..3306.42 rows=10003 width=362) (actual time=0.014..0.153 rows=152 loops=1)
                    Filter: (("publicationState" = ('published'::cstring)::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                    Rows Removed by Filter: 6
                    Buffers: shared hit=152
              ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags t2  (cost=0.41..0.57 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=152)
                    Index Cond: (("tagId" = '02787ecb-e940-45f1-b936-bf3a45d73023'::uuid) AND ("questionId" = questions.id) AND ("questionId" IS NOT NULL))
                    Heap Fetches: 0
                    Buffers: shared hit=457
        ->  Index Only Scan using clients_pkey on clients j0  (cost=0.15..0.17 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=50)
              Index Cond: (id = questions."clientId")
              Heap Fetches: 18
              Buffers: shared hit=36
        SubPlan 2
          ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.003..0.004 rows=1 loops=1)
                Filter: (("clientId" IS NOT NULL) AND ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                Rows Removed by Filter: 2
                Buffers: shared hit=1
Planning:
  Buffers: shared hit=28
Planning Time: 0.500 ms
Execution Time: 0.582 ms
```

### a rare Tag

```
Limit  (cost=938.81..938.93 rows=50 width=418) (actual time=0.672..0.679 rows=50 loops=1)
  Buffers: shared hit=547
  ->  Sort  (cost=938.81..939.21 rows=160 width=418) (actual time=0.671..0.675 rows=50 loops=1)
        Sort Key: questions."createdAt" DESC, questions.id DESC
        Sort Method: top-N heapsort  Memory: 65kB
        Buffers: shared hit=547
        ->  Hash Left Join  (cost=32.53..933.49 rows=160 width=418) (actual time=0.055..0.561 rows=180 loops=1)
              Hash Cond: (questions."clientId" = j0.id)
              Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
              Buffers: shared hit=547
              ->  Nested Loop  (cost=0.70..899.60 rows=178 width=362) (actual time=0.035..0.457 rows=180 loops=1)
                    Buffers: shared hit=545
                    ->  Index Only Scan Backward using "question_tags_tagId_questionId_idx" on question_tags t2  (cost=0.41..11.97 rows=178 width=16) (actual time=0.021..0.042 rows=180 loops=1)
                          Index Cond: (("tagId" = '6546d227-7b79-4adc-8685-b76f37191e84'::uuid) AND ("questionId" IS NOT NULL))
                          Heap Fetches: 0
                          Buffers: shared hit=5
                    ->  Index Scan using questions_pkey on questions  (cost=0.29..4.99 rows=1 width=362) (actual time=0.002..0.002 rows=1 loops=180)
                          Index Cond: (id = t2."questionId")
                          Filter: (("publicationState" = ('published'::cstring)::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                          Buffers: shared hit=540
              ->  Hash  (cost=19.70..19.70 rows=970 width=16) (actual time=0.008..0.008 rows=2 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on clients j0  (cost=0.00..19.70 rows=970 width=16) (actual time=0.002..0.003 rows=2 loops=1)
                          Buffers: shared hit=1
              SubPlan 2
                ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.002..0.003 rows=1 loops=1)
                      Filter: (("clientId" IS NOT NULL) AND ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                      Rows Removed by Filter: 2
                      Buffers: shared hit=1
Planning:
  Buffers: shared hit=28
Planning Time: 0.503 ms
Execution Time: 0.768 ms
```

### two Categories

```
Limit  (cost=1.26..488.74 rows=50 width=418) (actual time=0.143..1.503 rows=50 loops=1)
  Buffers: shared hit=1473
  ->  Nested Loop Left Join  (cost=1.26..12461.01 rows=1278 width=418) (actual time=0.142..1.494 rows=50 loops=1)
        Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
        Buffers: shared hit=1473
        ->  Nested Loop  (cost=1.11..10700.56 rows=1424 width=362) (actual time=0.122..1.397 rows=50 loops=1)
              Buffers: shared hit=1448
              ->  Nested Loop  (cost=0.70..8994.58 rows=3000 width=378) (actual time=0.076..1.118 rows=91 loops=1)
                    Buffers: shared hit=1174
                    ->  Index Scan using "questions_createdAt_id_idx" on questions  (cost=0.29..3306.42 rows=10003 width=362) (actual time=0.023..0.369 rows=293 loops=1)
                          Filter: (("publicationState" = ('published'::cstring)::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                          Rows Removed by Filter: 6
                          Buffers: shared hit=294
                    ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags t2  (cost=0.41..0.57 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=293)
                          Index Cond: (("tagId" = '02787ecb-e940-45f1-b936-bf3a45d73023'::uuid) AND ("questionId" = questions.id) AND ("questionId" IS NOT NULL))
                          Heap Fetches: 0
                          Buffers: shared hit=880
              ->  Index Only Scan using "question_tags_tagId_questionId_idx" on question_tags t3  (cost=0.41..0.57 rows=1 width=16) (actual time=0.003..0.003 rows=1 loops=91)
                    Index Cond: (("tagId" = 'e4cda90b-2f83-4491-89a7-693cf6f6229b'::uuid) AND ("questionId" = questions.id) AND ("questionId" IS NOT NULL))
                    Heap Fetches: 0
                    Buffers: shared hit=274
        ->  Index Only Scan using clients_pkey on clients j0  (cost=0.15..0.17 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=50)
              Index Cond: (id = questions."clientId")
              Heap Fetches: 12
              Buffers: shared hit=24
        SubPlan 2
          ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.007..0.007 rows=1 loops=1)
                Filter: (("clientId" IS NOT NULL) AND ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                Rows Removed by Filter: 2
                Buffers: shared hit=1
Planning:
  Buffers: shared hit=88
Planning Time: 1.986 ms
Execution Time: 1.659 ms
```

### a common Tag, a deep page

```
Limit  (cost=1341.55..1341.67 rows=50 width=418) (actual time=13.779..13.793 rows=50 loops=1)
  Buffers: shared hit=722
  ->  Sort  (cost=1336.55..1343.28 rows=2693 width=418) (actual time=13.486..13.701 rows=2050 loops=1)
        Sort Key: questions."createdAt" DESC, questions.id DESC
        Sort Method: quicksort  Memory: 1525kB
        Buffers: shared hit=722
        ->  Hash Left Join  (cost=225.81..1183.12 rows=2693 width=418) (actual time=1.507..10.651 rows=2962 loops=1)
              Hash Cond: (questions."clientId" = j0.id)
              Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
              Buffers: shared hit=722
              ->  Hash Join  (cost=193.98..1115.43 rows=3000 width=362) (actual time=1.470..8.827 rows=2962 loops=1)
                    Hash Cond: (questions.id = t2."questionId")
                    Buffers: shared hit=720
                    ->  Seq Scan on questions  (cost=0.00..895.18 rows=10003 width=362) (actual time=0.008..4.891 rows=10003 loops=1)
                          Filter: (("publicationState" = ('published'::cstring)::"PublicationState") OR ("authorId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                          Rows Removed by Filter: 6
                          Buffers: shared hit=695
                    ->  Hash  (cost=156.45..156.45 rows=3002 width=16) (actual time=1.417..1.418 rows=2962 loops=1)
                          Buckets: 4096  Batches: 1  Memory Usage: 171kB
                          Buffers: shared hit=25
                          ->  Index Only Scan Backward using "question_tags_tagId_questionId_idx" on question_tags t2  (cost=0.41..156.45 rows=3002 width=16) (actual time=0.044..0.640 rows=2962 loops=1)
                                Index Cond: (("tagId" = '02787ecb-e940-45f1-b936-bf3a45d73023'::uuid) AND ("questionId" IS NOT NULL))
                                Heap Fetches: 0
                                Buffers: shared hit=25
              ->  Hash  (cost=19.70..19.70 rows=970 width=16) (actual time=0.014..0.015 rows=2 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on clients j0  (cost=0.00..19.70 rows=970 width=16) (actual time=0.004..0.006 rows=2 loops=1)
                          Buffers: shared hit=1
              SubPlan 2
                ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                      Filter: (("clientId" IS NOT NULL) AND ("viewerId" = '2353fdc5-dc11-46e5-baeb-ececde95f938'::uuid))
                      Rows Removed by Filter: 2
                      Buffers: shared hit=1
Planning:
  Buffers: shared hit=28
Planning Time: 0.994 ms
Execution Time: 14.084 ms
```

### no Category, as the Author

```
Limit  (cost=0.44..87.68 rows=50 width=418) (actual time=0.076..0.218 rows=50 loops=1)
  Buffers: shared hit=88
  ->  Nested Loop Left Join  (cost=0.44..15678.12 rows=8985 width=418) (actual time=0.074..0.211 rows=50 loops=1)
        Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
        Rows Removed by Filter: 3
        Buffers: shared hit=88
        ->  Index Scan using "questions_createdAt_id_idx" on questions  (cost=0.29..3306.42 rows=10009 width=362) (actual time=0.031..0.096 rows=53 loops=1)
              Filter: (("publicationState" = ('published'::cstring)::"PublicationState") OR ("authorId" = '22ed73ea-999f-4852-876b-893313367b90'::uuid))
              Buffers: shared hit=47
        ->  Index Only Scan using clients_pkey on clients j0  (cost=0.15..0.17 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=53)
              Index Cond: (id = questions."clientId")
              Heap Fetches: 20
              Buffers: shared hit=40
        SubPlan 2
          ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.006..0.007 rows=1 loops=1)
                Filter: (("clientId" IS NOT NULL) AND ("viewerId" = '22ed73ea-999f-4852-876b-893313367b90'::uuid))
                Rows Removed by Filter: 2
                Buffers: shared hit=1
Planning Time: 0.404 ms
Execution Time: 0.330 ms
```

### no Category, as a Reviewer

```
Limit  (cost=0.44..87.12 rows=50 width=418) (actual time=0.054..0.213 rows=50 loops=1)
  Buffers: shared hit=117
  ->  Nested Loop Left Join  (cost=0.44..15578.03 rows=8985 width=418) (actual time=0.053..0.198 rows=50 loops=1)
        Filter: ((questions."clientId" IS NULL) OR ((hashed SubPlan 2) AND (j0.id IS NOT NULL)))
        Rows Removed by Filter: 22
        Buffers: shared hit=117
        ->  Index Scan using "questions_createdAt_id_idx" on questions  (cost=0.29..3206.33 rows=10009 width=362) (actual time=0.019..0.079 rows=72 loops=1)
              Buffers: shared hit=66
        ->  Index Only Scan using clients_pkey on clients j0  (cost=0.15..0.17 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=72)
              Index Cond: (id = questions."clientId")
              Heap Fetches: 25
              Buffers: shared hit=50
        SubPlan 2
          ->  Seq Scan on permission_grants t1  (cost=0.00..1.04 rows=1 width=16) (actual time=0.004..0.005 rows=1 loops=1)
                Filter: (("clientId" IS NOT NULL) AND ("viewerId" = 'f4343a6b-7b06-4b86-89a2-f399ddff36eb'::uuid))
                Rows Removed by Filter: 2
                Buffers: shared hit=1
Planning Time: 0.252 ms
Execution Time: 0.302 ms
```
