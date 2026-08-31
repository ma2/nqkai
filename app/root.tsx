import type { ReactNode } from "react";
import {
  Form,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import { Logo, LogoMark } from "./components/Logo";
import { getAuth } from "./server/auth.server";
import { getServerContext } from "./server/context.server";
import { countUnread } from "./server/notifications.server";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export const meta: Route.MetaFunction = () => [
  { title: "nQkai" },
  { name: "description", content: "オンラインで句会を開催・管理する" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  if (!auth) return { user: null, unreadCount: 0 };

  return {
    user: {
      id: auth.user.id,
      haigo: auth.user.haigo,
      isSystemAdmin: auth.user.isSystemAdmin,
    },
    unreadCount: await countUnread(db, auth.user.id),
  };
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function Header({
  user,
  unreadCount,
}: {
  user: { haigo: string; isSystemAdmin: boolean } | null;
  unreadCount: number;
}) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <Link to="/" aria-label="nQkai ホーム">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/kukai" className="text-sumi hover:text-ai">
                <span className="sm:hidden">句会</span>
                <span className="hidden sm:inline">進行中の句会</span>
              </Link>
              <Link to="/notifications" className="text-sumi hover:text-ai">
                通知
                {unreadCount > 0 ? (
                  <span className="ml-1 inline-flex min-w-[1.25rem] justify-center rounded-full bg-shu px-1 py-0.5 text-2xs text-washi">
                    {unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link to="/settings" className="text-sumi hover:text-ai">
                {user.haigo}
              </Link>
              <Form method="post" action="/settings">
                <input type="hidden" name="intent" value="logout" />
                <button
                  type="submit"
                  className="rounded-[3px] border border-rule px-2 py-1 text-sumi-soft hover:bg-washi-edge"
                >
                  ログアウト
                </button>
              </Form>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sumi hover:text-ai">
                ログイン
              </Link>
              <Link
                to="/register"
                className="rounded-[3px] bg-ai px-3 py-1.5 text-washi hover:bg-ai-deep"
              >
                新規登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { user, unreadCount } = loaderData;
  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={user} unreadCount={unreadCount} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-rule py-6 text-center text-xs text-sumi-soft">
        <span className="inline-flex items-center gap-1.5">
          <LogoMark size={14} className="text-sumi-soft" />
          nQkai
        </span>
      </footer>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "エラーが発生しました";
  let detail = "";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "ページが見つかりません" : `${error.status} ${error.statusText}`;
    detail = typeof error.data === "string" ? error.data : "";
  } else if (error instanceof Error && import.meta.env.DEV) {
    detail = error.message;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <h1 className="font-mincho text-xl font-medium tracking-wide">{title}</h1>
      {detail ? <p className="mt-2 text-sm text-sumi-soft">{detail}</p> : null}
      <p className="mt-6">
        <Link to="/" className="text-sm text-sumi underline">
          トップへ戻る
        </Link>
      </p>
    </main>
  );
}
