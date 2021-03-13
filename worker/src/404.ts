const page = `
<!doctype html>
<html>
  <head></head>
  <body>
    <h1>Not Found</h1>
    <p>the-platform has nothing to serve at this URL.</p>
  </body>
</html>
`;

export function fourOhFour() {
  return new Response(page, {
    status: 404,
    headers: { 'content-type': 'text/html' },
  });
}
