import { Link } from "react-router-dom";

export default function Welcome() {
  return (
    <div className="mx-auto max-w-xl text-center py-16">
      <h1 className="text-3xl font-bold mb-4">Welcome to Pick Six</h1>
      <p className="text-muted mb-8">Create or join leagues, make picks, and compete with friends.</p>
      <div className="flex items-center justify-center gap-3 mb-6">
        <Link to="/login" className="btn">Log in</Link>
        <Link to="/signup" className="btn btn-light">Sign up</Link>
      </div>
      <p className="text-sm text-muted">
        New here? <Link to="/leagues/join" className="link">Join a league</Link> or <Link to="/leagues/create" className="link">Create one</Link> after logging in.
      </p>
    </div>
  );
}
