import { useState, type FormEvent } from "react";
import { Button } from "@/ui/shadcn/button";
import { Input } from "@/ui/shadcn/input";

type BrowseSearchBoxProps = {
  keywords: string | undefined;
  onSearch: (keywords: string | undefined) => void;
  /** Set on Home, where searching is the first thing a Viewer is offered. */
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
    <form role="search" className="flex gap-2" onSubmit={submit}>
      <Input
        type="search"
        aria-label="Search"
        placeholder="Search Question text and Answer Notes"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        className={large ? "h-12 px-4 md:text-base" : undefined}
      />
      <Button type="submit" className={large ? "h-12 px-6" : undefined}>
        Search
      </Button>
    </form>
  );
}
