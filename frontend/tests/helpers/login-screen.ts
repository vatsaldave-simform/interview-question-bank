import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Types credentials into a rendered login screen and presses the button, the way a
 * Viewer would. */
export async function signInOnScreen(email: string, password: string): Promise<void> {
  if (email !== "") await userEvent.type(screen.getByLabelText("Email"), email);
  if (password !== "") await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}
