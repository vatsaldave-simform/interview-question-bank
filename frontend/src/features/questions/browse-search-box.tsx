import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/shadcn/button";
import { Card } from "@/ui/shadcn/card";

type BrowseSearchBoxProps = {
  keywords: string | undefined;
  onSearch: (keywords: string | undefined) => void;
  /** Home's box: larger, with the Search button inside it. */
  large?: boolean;
};

/** Sends the search on submit rather than on every key, so a half-typed word never
 * becomes a request or an entry in the browser's history. */
export function BrowseSearchBox({ keywords, onSearch, large = false }: BrowseSearchBoxProps) {
  const [typed, setTyped] = useState(keywords ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = typed.trim();
    onSearch(trimmed === "" ? undefined : trimmed);
  }

  return (
    <form role="search" onSubmit={submit}>
      <Card
        className={cn(
          "focus-within:ring-ring flex-row items-center focus-within:ring-2",
          large ? "gap-2.5 rounded-2xl py-2 pr-2 pl-4" : "min-h-10.5 gap-2 rounded-xl py-0 pr-1.5 pl-3",
        )}
      >
        <SearchIcon
          aria-hidden="true"
          className={cn("text-muted-foreground shrink-0", large ? "size-5" : "size-4.5")}
        />
        {/* A bare field, because the card round it is what looks like the box. */}
        <input
          type="search"
          aria-label="Search"
          placeholder={large ? "Search Questions, for example “event loop”" : "Search Questions"}
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className={cn(
            "placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-2 outline-none",
            large ? "text-base" : "text-sm",
          )}
        />
        {large && <Button type="submit">Search</Button>}
      </Card>
    </form>
  );
}
