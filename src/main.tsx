// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import AppLayout from "./components/AppLayout";
import ToastHost from "./components/ToastHost";
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
import Home from "./pages/Home";
import History from "./pages/History";
import Onboarding from "./pages/Onboarding";

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
        <RouterProvider router={router} />
      </ToastHost>
    </AuthProvider>
  </React.StrictMode>
);
