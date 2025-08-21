import { Link } from "react-router-dom";

export default function LeaguesStart() {
  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-bold text-center mb-4">Get Started</h1>
      <p className="text-center text-muted mb-6">Create a new league or join an existing one.</p>
      <div className="grid gap-3">
        <Link to="/leagues/create" className="btn w-full text-center py-3 text-base">Create a League</Link>
        <Link to="/leagues/join" className="btn-light w-full text-center py-3 text-base">Join a League</Link>
      </div>
    </div>
  );
}
