import parse5 from 'parse5';

export async function transformHTML(
  filename: string,
  response: Response,
  forwardHeaders: Headers
): Promise<Response> {
  if (response.status !== 200) {
    return response;
  }
  let body = await response.text();
  let document = parse5.parse(body);
  traverse(document);

  return new Response(parse5.serialize(document), {
    headers: forwardHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}

// TODO
function contentFor(_section: string) {
  return '';
}

// TODO
const rootURL = '/';
const appName = 'ember-app';

function traverse(node: parse5.Node) {
  if (node.nodeName === 'script') {
    let src = node.attrs.find((a) => a.name === 'src');
    if (src) {
      src.value = src.value.replace('{{rootURL}}', rootURL);
      if (src.value === `/assets/${appName}.js`) {
        node.parentNode.childNodes.splice(
          node.parentNode.childNodes.indexOf(node),
          1,
          {
            nodeName: 'script',
            tagName: 'script',
            attrs: [
              { name: 'src', value: './_entry_/index.js' },
              { name: 'type', value: 'module' },
            ],
            childNodes: [],
            parentNode: node.parentNode,
            namespaceURI: 'http://www.w3.org/1999/xhtml',
          }
        );
        return;
      }
    }
  }

  if (
    node.nodeName === 'link' &&
    node.attrs.find((a) => a.name === 'rel' && a.value === 'stylesheet')
  ) {
    let href = node.attrs.find((a) => a.name === 'href');
    if (href) {
      href.value = href.value.replace('{{rootURL}}', rootURL);
    }
  }

  if (node.nodeName === '#text' && 'value' in node) {
    node.value = node.value.replace(
      /{{content-for "([^"]*)"}}/g,
      function (_, section) {
        return contentFor(section);
      }
    );
  }

  if ('childNodes' in node) {
    for (let child of node.childNodes.slice()) {
      traverse(child);
    }
  }
}
