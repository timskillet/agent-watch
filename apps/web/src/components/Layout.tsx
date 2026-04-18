import { Outlet, Link, useLocation } from "react-router-dom";
import { SelectionProvider } from "../context/SelectionContext";
import styles from "./Layout.module.css";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/compare", label: "Compare" },
];

const PLACEHOLDER_RUNS = [
  { id: "sess-a1b2c3", time: "2m ago" },
  { id: "sess-d4e5f6", time: "1h ago" },
  { id: "sess-g7h8i9", time: "3h ago" },
];

export function Layout() {
  const { pathname } = useLocation();

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <Link to="/" className={styles.logo}>
          AgentWatch
        </Link>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Navigation</div>
          <nav className={styles.nav}>
            {NAV_LINKS.map(({ to, label }) => {
              const active =
                to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Recent Runs</div>
          <div className={styles.recentRuns}>
            {PLACEHOLDER_RUNS.map(({ id, time }) => (
              <div key={id} className={styles.runItem}>
                <span className={styles.runId}>{id}</span>
                <span className={styles.runTime}>{time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sectionBottom}>
          <div className={styles.sectionLabel}>Project</div>
          <div className={styles.projectSelector}>
            <span>All Projects</span>
            <span className={styles.projectArrow}>{"\u25BE"}</span>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <SelectionProvider>
          <Outlet />
        </SelectionProvider>
      </main>
    </div>
  );
}
