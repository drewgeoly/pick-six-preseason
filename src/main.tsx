// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { assertNoPublicSecrets } from "./lib/envGuards";
import Welcome from "./pages/Welcome";

import { AuthProvider } from "./auth/AuthProvider";
import AppLayout from "./components/AppLayout";
import LeagueProvider from "./league/LeagueProvider"; 
import { RequireAuth, RedirectIfAuth, RequireLeagueMember } from "./auth/RouteGuards";

// Public pages
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import LeaguesCreate from "./pages/LeaguesCreate";
import LeaguesJoin from "./pages/LeaguesJoin";

// League-scoped pages
import Leaderboard from "./pages/Leaderboard";
import ComparePicks from "./pages/ComparePicks";
import Consensus from "./pages/Consensus";
import AdminSelectGames from "./pages/AdminSelectGames";
import AdminSetResults from "./pages/AdminSetResults";
import AdminScoring from "./pages/AdminScoring";
import MakePicks from "./pages/MakePicks"; // or your picks page
import Members from "./pages/Members";

const router = createBrowserRouter([
  // Welcome landing with clear Log in / Sign up
  { path: "/", element: <Welcome /> },

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
            { path: "leaderboard/:weekId", element: <Leaderboard /> },
            { path: "picks/:weekId", element: <MakePicks /> },
            { path: "compare/:weekId", element: <ComparePicks /> },
            { path: "consensus/:weekId", element: <Consensus /> },
            { path: "members", element: <Members /> },
            { path: "admin/select-games/:weekId", element: <AdminSelectGames /> },
            { path: "admin/set-results/:weekId", element: <AdminSetResults /> },
            { path: "admin/scoring/:weekId", element: <AdminScoring /> },
          ]},
        ],
      },
    ],
  },
], {
  // Ensure routing works under GitHub Pages subpath like "/pick-six-preseason/"
  basename: import.meta.env.BASE_URL,
});

// Security check: in production, ensure no sensitive client env vars are present
assertNoPublicSecrets();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
