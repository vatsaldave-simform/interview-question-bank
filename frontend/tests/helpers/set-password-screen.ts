import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Types a new password, and the same password again, into a rendered set-password page
 * and presses the button, the way a Viewer would. */
export async function setPasswordOnScreen(password: string, again: string): Promise<void> {
  const first = await screen.findByLabelText("New password");
  if (password !== "") await userEvent.type(first, password);
  if (again !== "") await userEvent.type(screen.getByLabelText("The same password again"), again);
  await userEvent.click(screen.getByRole("button", { name: "Set my password" }));
}
