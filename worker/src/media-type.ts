import { parse, format, ParsedMediaType } from 'content-type';

export function mediaType(
  response: Response
): { media: ParsedMediaType; forwardHeaders: Headers } {
  let media: ParsedMediaType;
  let forwardHeaders = response.headers;
  let header = response.headers.get('content-type');
  if (header) {
    media = parse(header);
  } else {
    media = { type: 'application/octet-stream', parameters: {} };
  }

  if (response.url) {
    let url = new URL(response.url);

    // webservers aren't generally configured to give us a meaningful mime type
    // for typescript. For our purposes, we want to treat it just like Javascript
    // because our Javascript handling is extended to cover TS syntax.
    if (url.pathname.endsWith('.ts')) {
      media.type = 'application/javascript';
      forwardHeaders = new Headers(forwardHeaders);
      forwardHeaders.set('content-type', format(media));
    }

    if (url.pathname.endsWith('.hbs')) {
      // we will treat it as handlebars type
      media.type = 'application/vnd.glimmer.hbs';
      forwardHeaders = new Headers(forwardHeaders);
      // we will tell the browser it is javascript
      forwardHeaders.set(
        'content-type',
        format({ type: 'application/javascript', parameters: media.parameters })
      );
    }
  }

  return { media, forwardHeaders };
}

export function accepts(request: Request, type: string): boolean {
  return request.headers.get('accept')?.split(',').includes(type) || false;
}
