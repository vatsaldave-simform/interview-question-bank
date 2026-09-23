import { useState, type FormEvent } from "react";
import { Button } from "@/ui/shadcn/button";
import { Input } from "@/ui/shadcn/input";

type BrowseSearchBoxProps = {
  keywords: string | undefined;
  onSearch: (keywords: string | undefined) => void;
};

/** Sends the search on submit rather than on every key, so a half-typed word never
 * becomes a request or an entry in the browser's history. */
export function BrowseSearchBox({ keywords, onSearch }: BrowseSearchBoxProps) {
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
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
