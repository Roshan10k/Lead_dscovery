// RTK Query's fetchBaseQuery rejects .unwrap() with either
// { status: <http code>, data: { error: "..." } } for a real API response, or
// { status: "FETCH_ERROR", error: "..." } when the request never reached the
// server at all (API down, CORS, offline). Handle both so a network failure
// doesn't just throw an unhandled rejection with no user-visible feedback.
export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    if ("data" in err) {
      const data = (err as { data?: unknown }).data;
      if (data && typeof data === "object" && "error" in data) {
        return String((data as { error: unknown }).error);
      }
    }
    if ("error" in err) {
      return String((err as { error: unknown }).error);
    }
  }
  return "Couldn't reach the server. Make sure the API is running and try again.";
}
