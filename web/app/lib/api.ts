const url = process.env.NEXT_PUBLIC_API_URL;

if (!url) {
  throw new Error(
    "[PackGuardian] NEXT_PUBLIC_API_URL is not set. " +
      "Create web/.env.local for local dev or ensure web/.env.production is present before building."
  );
}

export const API_URL: string = url;
