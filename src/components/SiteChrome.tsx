import Image from "next/image";
import { LockKeyhole } from "lucide-react";

import logo from "@/assets/logo.png";

// The approval page's own small header and footer, in the shop's brand grey with its logo (as in
// hashtag-next's Header and Footer), but without the shop's menus, cart or sign-in. Nothing here
// links back to the shop: the customer only reviews their artwork and contacts us by email.

// Just the logo: the heading under it ("Review your artwork" on the order's page) says what the page is about.
export function SiteHeader() {
  return (
    <header className="border-b border-secondary-hover bg-secondary text-secondary-foreground">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-4 sm:px-6">
        <Image src={logo} alt="HashtagBillionaire" loading="eager" className="h-10 w-auto sm:h-11" />
      </div>
    </header>
  );
}

// Shown as a mailto link only when it looks like one address.
const EMAIL = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

/** `order`: an order is on the page, so its link is worth keeping private. */
export function SiteFooter({ supportEmail, order = false }: { supportEmail?: string | null; order?: boolean }) {
  const email = supportEmail && EMAIL.test(supportEmail) ? supportEmail : null;
  return (
    <footer className="mt-auto border-t border-secondary-hover bg-secondary text-secondary-foreground">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="space-y-1">
          {email ? (
            <p>
              Questions about your artwork? Email{" "}
              <a href={`mailto:${email}`} className="font-semibold underline underline-offset-2 wrap-anywhere">
                {email}
              </a>
            </p>
          ) : null}
          {order ? (
            <p className="flex items-center gap-1.5 text-secondary-ink">
              <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
              This page is private to your order. Please don&apos;t share its link.
            </p>
          ) : null}
        </div>
        <p className="text-secondary-ink">© HashtagBillionaire</p>
      </div>
    </footer>
  );
}
