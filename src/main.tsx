// src/main.tsx
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import AppLayout from "./components/AppLayout";
import ToastHost from "./components/ToastHost";
import LeagueProvider from "./league/LeagueProvider"; 
import { RequireAuth, RedirectIfAuth, RequireLeagueMember } from "./auth/RouteGuards";

// Public pages (code-split)
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const LeaguesCreate = lazy(() => import("./pages/LeaguesCreate"));
const LeaguesJoin = lazy(() => import("./pages/LeaguesJoin"));
const Landing = lazy(() => import("./pages/Landing"));

// League-scoped pages (code-split)
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const ComparePicks = lazy(() => import("./pages/ComparePicks"));
const Consensus = lazy(() => import("./pages/Consensus"));
const AdminSelectGames = lazy(() => import("./pages/AdminSelectGames"));
const AdminSetResults = lazy(() => import("./pages/AdminSetResults"));
const AdminScoring = lazy(() => import("./pages/AdminScoring"));
const MakePicks = lazy(() => import("./pages/MakePicks"));
const Members = lazy(() => import("./pages/Members"));
const Home = lazy(() => import("./pages/Home"));
const History = lazy(() => import("./pages/History"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

const router = createBrowserRouter([
  // Redirect "/" to something real
  { path: "/", element: <Navigate to="/login" replace /> },

  // Public area under AppLayout
  {
    element: <AppLayout />,
    children: [
      // If already authenticated, redirect away from auth pages
      { element: <RedirectIfAuth /> , children: [
        { path: "/login", element: <Login /> },
        { path: "/signup", element: <Signup /> },
        { path: "/reset", element: <ResetPassword /> },
      ]},

      // Require auth for these pages
      { element: <RequireAuth /> , children: [
        { path: "/landing", element: <Landing /> },
        { path: "/profile", element: <Profile /> },
        { path: "/leagues/create", element: <LeaguesCreate /> },
        { path: "/leagues/join", element: <LeaguesJoin /> },
      ]},
    ],
  },

  // League-scoped area under auth guard, then LeagueProvider + AppLayout
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/l/:leagueId",
        element: (
          <LeagueProvider>
            <AppLayout />
          </LeagueProvider>
        ),
        children: [
          { element: <RequireLeagueMember />, children: [
            { path: "home/:weekId", element: <Home /> },
            { path: "onboarding/:weekId", element: <Onboarding /> },
            { path: "leaderboard/:weekId", element: <Leaderboard /> },
            { path: "picks/:weekId", element: <MakePicks /> },
            { path: "compare/:weekId", element: <ComparePicks /> },
            { path: "consensus/:weekId", element: <Consensus /> },
            { path: "members", element: <Members /> },
            { path: "history", element: <History /> },
            { path: "admin/select-games/:weekId", element: <AdminSelectGames /> },
            { path: "admin/set-results/:weekId", element: <AdminSetResults /> },
            { path: "admin/scoring/:weekId", element: <AdminScoring /> },
          ]},
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastHost>
        <Suspense fallback={
          <div className="p-6 space-y-3">
            <div className="h-6 w-40 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
            <div className="h-10 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
            <div className="h-10 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
          </div>
        }>
          <RouterProvider router={router} />
        </Suspense>
      </ToastHost>
    </AuthProvider>
  </React.StrictMode>
);
