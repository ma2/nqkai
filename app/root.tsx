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
import { getAuth } from "./server/auth.server";
import { getServerContext } from "./server/context.server";
import { countUnread } from "./server/notifications.server";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];

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
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold tracking-tight">
          nQkai
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/orgs" className="hidden text-stone-700 hover:text-stone-950 sm:inline">
                結社
              </Link>
              <Link to="/notifications" className="text-stone-700 hover:text-stone-950">
                通知
                {unreadCount > 0 ? (
                  <span className="ml-1 rounded-full bg-stone-900 px-1.5 py-0.5 text-xs text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link to="/settings" className="text-stone-700 hover:text-stone-950">
                {user.haigo}
              </Link>
              <Form method="post" action="/settings">
                <input type="hidden" name="intent" value="logout" />
                <button
                  type="submit"
                  className="rounded border border-stone-300 px-2 py-1 text-stone-600 hover:bg-stone-100"
                >
                  ログアウト
                </button>
              </Form>
            </>
          ) : (
            <>
              <Link to="/login" className="text-stone-700 hover:text-stone-950">
                ログイン
              </Link>
              <Link
                to="/register"
                className="rounded bg-stone-900 px-3 py-1 text-white hover:bg-stone-700"
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
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        nQkai
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
      <h1 className="text-xl font-bold">{title}</h1>
      {detail ? <p className="mt-2 text-sm text-stone-500">{detail}</p> : null}
      <p className="mt-6">
        <Link to="/" className="text-sm text-stone-700 underline">
          トップへ戻る
        </Link>
      </p>
    </main>
  );
}
