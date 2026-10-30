export function sameOrigin(request: Request, origin: string) {
  return (
    request.headers.get('origin') === origin &&
    !['cross-site', 'none'].includes(
      request.headers.get('sec-fetch-site') ?? '',
    ) &&
    request.headers.get('content-type')?.split(';')[0] === 'application/json'
  );
}
export function createSignInBudget() {
  let start = 0,
    count = 0,
    active = 0;
  return (now: number) => {
    if (now - start >= 60_000) {
      start = now;
      count = 0;
    }
    if (++count > 30 || active >= 4) return null;
    active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        active--;
      }
    };
  };
}
