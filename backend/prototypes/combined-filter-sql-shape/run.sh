#!/usr/bin/env bash
# PROTOTYPE — throwaway. One command, no setup: spins up its own scratch Postgres
# cluster in a temp directory, seeds 10k Questions, EXPLAIN ANALYZEs both candidate
# SQL shapes for the combined Category filter, and prints a comparison.
#
# The cluster is created fresh and destroyed on exit. It never touches the system
# Postgres. Run with KEEP=1 to leave it up for poking around.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGDATA_DIR="${SCRATCH:-${TMPDIR:-/tmp}}/PROTOTYPE-combined-filter-pgdata-wipe-me"
PORT="${PORT:-55432}"
DB=proto
USER_NAME=proto
VIEWER=1          # the Viewer holding Permission Grants for clients 1 and 2
PAGE=50           # page size
RUNS="${RUNS:-5}" # repeats per measurement; median reported
ROWS="${ROWS:-10000}" # bank size; the question is about 10k, the knob is for checking the verdict holds
RESULTS="$HERE/results/$ROWS"

BIN="$(pg_config --bindir 2>/dev/null || true)"
if [[ -z "$BIN" || ! -x "$BIN/initdb" ]]; then
  BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi
[[ -x "$BIN/initdb" ]] || { echo "Could not find a Postgres bin directory (initdb)." >&2; exit 1; }

psqlq() { "$BIN/psql" -X -q -t -A -h "$PGDATA_DIR" -p "$PORT" -U "$USER_NAME" -d "$DB" "$@"; }
psqlp() { "$BIN/psql" -X -q    -h "$PGDATA_DIR" -p "$PORT" -U "$USER_NAME" -d "$DB" "$@"; }

cleanup() {
  if [[ "${KEEP:-0}" == "1" ]]; then
    echo
    echo "KEEP=1 — cluster left running. Connect with:"
    echo "  $BIN/psql -h $PGDATA_DIR -p $PORT -U $USER_NAME -d $DB"
    echo "Stop and wipe it with:"
    echo "  $BIN/pg_ctl -D $PGDATA_DIR stop && rm -rf $PGDATA_DIR"
  else
    "$BIN/pg_ctl" -D "$PGDATA_DIR" -m immediate -w stop >/dev/null 2>&1 || true
    rm -rf "$PGDATA_DIR"
  fi
}

# ---------------------------------------------------------------- scratch cluster
echo "== scratch cluster =="
rm -rf "$PGDATA_DIR"
mkdir -p "$PGDATA_DIR" "$RESULTS"
"$BIN/initdb" -D "$PGDATA_DIR" -U "$USER_NAME" --auth=trust -E UTF8 >/dev/null
trap cleanup EXIT
"$BIN/pg_ctl" -D "$PGDATA_DIR" \
  -o "-p $PORT -k $PGDATA_DIR -c listen_addresses='' -c shared_buffers=256MB -c work_mem=32MB -c max_parallel_workers_per_gather=0" \
  -l "$PGDATA_DIR/server.log" -w start >/dev/null
"$BIN/createdb" -h "$PGDATA_DIR" -p "$PORT" -U "$USER_NAME" "$DB"
echo "up on $PGDATA_DIR:$PORT  ($("$BIN/psql" -X -t -A -h "$PGDATA_DIR" -p "$PORT" -U "$USER_NAME" -d "$DB" -c 'select version()' | cut -d, -f1))"
echo "parallel query disabled, so both shapes are compared on single-worker cost."

# ---------------------------------------------------------------- schema and seed
echo
echo "== schema and seed =="
psqlp -f "$HERE/schema.sql" >/dev/null
psqlp -v n_questions="$ROWS" -f "$HERE/seed.sql" >/dev/null
echo "Questions:      $(psqlq -c 'select count(*) from questions')"
echo "  restricted:   $(psqlq -c 'select count(*) from questions where client_id is not null')"
echo "  visible to viewer $VIEWER: $(psqlq -c "select count(*) from questions q where q.client_id is null or exists (select 1 from permission_grants g where g.viewer_id=$VIEWER and g.client_id=q.client_id)")"
echo "Categories:     $(psqlq -c 'select count(*) from categories')"
echo "Tags:           $(psqlq -c 'select count(*) from tags')"
echo "Question-Tags:  $(psqlq -c 'select count(*) from question_tags')"
echo "Heap size:      questions $(psqlq -c "select pg_size_pretty(pg_total_relation_size('questions'))"), question_tags $(psqlq -c "select pg_size_pretty(pg_total_relation_size('question_tags'))")"

# Popularity per Tag, used to pick 'broad' and 'narrow' scenario Tags.
# The narrow picks take the rarest Tags that still carry at least $3 Questions —
# the absolute rarest Tag makes the whole filter match nothing, which measures
# nothing.
popular_tags() {  # $1 = category id, $2 = how many, $3 = desc|asc, $4 = min count
  psqlq -c "SELECT t.id FROM tags t
            JOIN (SELECT tag_id, count(*) c FROM question_tags GROUP BY 1) p ON p.tag_id = t.id
            WHERE t.category_id = $1 AND p.c >= ${4:-0}
            ORDER BY p.c $3, t.id
            LIMIT $2" | paste -sd,
}
tag_share() {  # $1 = comma-separated tag ids -> % of all Questions carrying any of them
  psqlq -c "SELECT round(100.0 * count(DISTINCT question_id) / $ROWS, 1)
            FROM question_tags WHERE tag_id = ANY (ARRAY[$1])"
}

NARROW_FLOOR=$(( ROWS / 100 ))              # >= 1% of the bank
TECH_BROAD=$(popular_tags 1 2 desc)         # technology
SEN_BROAD=$(popular_tags 2 2 desc)          # seniority
QTYPE_BROAD=$(popular_tags 3 2 desc)        # question-type
FW_NARROW=$(popular_tags 9 2 asc $NARROW_FLOOR)    # framework
DOM_NARROW=$(popular_tags 10 2 asc $NARROW_FLOOR)  # domain-area
COMP_NARROW=$(popular_tags 7 2 asc $NARROW_FLOOR)  # competency

echo
echo "Scenario tag selectivity (share of all $ROWS Questions carrying any of the tags):"
printf '  %-28s %s%%\n' "technology (broad)"    "$(tag_share "$TECH_BROAD")"
printf '  %-28s %s%%\n' "seniority (broad)"     "$(tag_share "$SEN_BROAD")"
printf '  %-28s %s%%\n' "question-type (broad)" "$(tag_share "$QTYPE_BROAD")"
printf '  %-28s %s%%\n' "framework (narrow)"    "$(tag_share "$FW_NARROW")"
printf '  %-28s %s%%\n' "domain-area (narrow)"  "$(tag_share "$DOM_NARROW")"
printf '  %-28s %s%%\n' "competency (narrow)"   "$(tag_share "$COMP_NARROW")"

# ---------------------------------------------------------------- the two shapes
VISIBILITY="(q.client_id IS NULL
       OR EXISTS (SELECT 1 FROM permission_grants g
                  WHERE g.viewer_id = $VIEWER AND g.client_id = q.client_id))"

# Shape A: one EXISTS per Category. Tags within a Category OR via = ANY.
shape_a() {  # $1 = offset (or ALL), rest = one comma-separated tag list per Category
  local off=$1; shift
  local preds=""
  for ts in "$@"; do
    preds+="  AND EXISTS (SELECT 1 FROM question_tags qt
                  WHERE qt.question_id = q.id AND qt.tag_id = ANY (ARRAY[$ts]))
"
  done
  local tail="ORDER BY q.created_at DESC, q.id DESC LIMIT $PAGE OFFSET $off"
  [[ "$off" == "ALL" ]] && tail=""
  printf 'SELECT q.id, q.created_at\nFROM questions q\nWHERE %s\n%s%s' "$VISIBILITY" "$preds" "$tail"
}

# Shape B: one join, grouped, with a distinct-Category count in HAVING.
shape_b() {  # $1 = offset (or ALL), rest = one comma-separated tag list per Category
  local off=$1; shift
  local n=$#
  local all=""
  for ts in "$@"; do all+="${all:+,}$ts"; done
  local tail="ORDER BY q.created_at DESC, q.id DESC LIMIT $PAGE OFFSET $off"
  [[ "$off" == "ALL" ]] && tail=""
  printf 'SELECT q.id, q.created_at\nFROM questions q\nJOIN question_tags qt ON qt.question_id = q.id\nJOIN tags t ON t.id = qt.tag_id\nWHERE %s\n  AND qt.tag_id = ANY (ARRAY[%s])\nGROUP BY q.id\nHAVING count(DISTINCT t.category_id) = %d\n%s' \
    "$VISIBILITY" "$all" "$n" "$tail"
}

# ---------------------------------------------------------------- measurement
median() { sort -n | awk '{a[NR]=$1} END {if(NR%2) print a[(NR+1)/2]; else printf "%.3f\n",(a[NR/2]+a[NR/2+1])/2}'; }

# Runs EXPLAIN (ANALYZE, BUFFERS) $RUNS times, prints median execution ms,
# and appends the last plan to the scenario's results file.
measure() {  # $1 = label, $2 = sql, $3 = results file
  local label=$1 sql=$2 out=$3 times=() plan
  for _ in $(seq "$RUNS"); do
    plan=$(psqlp -c "EXPLAIN (ANALYZE, BUFFERS, TIMING ON) $sql")
    times+=("$(grep -oP 'Execution Time: \K[0-9.]+' <<<"$plan")")
  done
  {
    echo "--- $label ---"
    echo "$sql"
    echo
    echo "$plan"
    echo
  } >> "$out"
  printf '%s\n' "${times[@]}" | median
}

rows_for() { psqlq -c "SELECT count(*) FROM ($1) s"; }

scenario() {  # $1 = name, $2 = offset, rest = tag lists per Category
  local name=$1 off=$2; shift 2
  local out="$RESULTS/$(tr ' ' '-' <<<"$name").txt"
  : > "$out"

  local a_sql b_sql a_ms b_ms matched n_rows
  # Correctness first: both shapes must return the same Questions, unpaginated.
  local a_all b_all
  a_all=$(shape_a ALL "$@")
  b_all=$(shape_b ALL "$@")
  n_rows=$(rows_for "$a_all")

  # LAST = the deepest page this filter actually has, for the offset ceiling.
  if [[ "$off" == "LAST" ]]; then
    off=$(( (n_rows > PAGE ? n_rows - PAGE : 0) ))
    name="$name (offset $off of $n_rows)"
  fi
  a_sql=$(shape_a "$off" "$@")
  b_sql=$(shape_b "$off" "$@")
  local diff
  diff=$(psqlq -c "SELECT count(*) FROM ((($a_all) EXCEPT ($b_all)) UNION ALL (($b_all) EXCEPT ($a_all))) d")
  [[ "$diff" == "0" ]] && matched="same $n_rows rows" || matched="MISMATCH ($diff rows differ)"

  a_ms=$(measure "SHAPE A — EXISTS per Category" "$a_sql" "$out")
  b_ms=$(measure "SHAPE B — grouped aggregate"   "$b_sql" "$out")

  local winner ratio
  ratio=$(awk -v a="$a_ms" -v b="$b_ms" 'BEGIN{printf "%.1f", (a<b ? b/a : a/b)}')
  winner=$(awk -v a="$a_ms" -v b="$b_ms" 'BEGIN{print (a<b ? "A" : "B")}')

  printf '  %-46s %9s %9s   %-6s %5sx   %s\n' \
    "$name" "$a_ms" "$b_ms" "$winner" "$ratio" "$matched"
}

echo
echo "== EXPLAIN ANALYZE: median of $RUNS runs, milliseconds, page size $PAGE, bank $ROWS =="
printf '  %-46s %9s %9s   %-6s %6s   %s\n' "scenario" "A (ms)" "B (ms)" "faster" "by" "correctness"
printf '  %s\n' "$(printf '%.0s-' {1..114})"

scenario "1 category, broad"                    0    "$TECH_BROAD"
scenario "2 categories, broad"                  0    "$TECH_BROAD" "$SEN_BROAD"
scenario "3 categories, broad"                  0    "$TECH_BROAD" "$SEN_BROAD" "$QTYPE_BROAD"
scenario "1 category, narrow"                   0    "$FW_NARROW"
scenario "3 categories, narrow"                 0    "$FW_NARROW" "$DOM_NARROW" "$COMP_NARROW"
scenario "3 categories, mixed broad+narrow"     0    "$TECH_BROAD" "$SEN_BROAD" "$DOM_NARROW"
scenario "2 categories, broad, last page"       LAST "$TECH_BROAD" "$SEN_BROAD"

echo
echo "Full plans written to $RESULTS/"
