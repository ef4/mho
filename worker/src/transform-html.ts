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
  if (node.nodeName === 'head') {
    node.childNodes.push({
      nodeName: 'meta',
      tagName: 'meta',
      attrs: [
        { name: 'name', value: 'ember-app/config/environment' },
        {
          name: 'content',
          value:
            '%7B%22modulePrefix%22%3A%22ember-app%22%2C%22environment%22%3A%22development%22%2C%22rootURL%22%3A%22%2F%22%2C%22locationType%22%3A%22auto%22%2C%22EmberENV%22%3A%7B%22FEATURES%22%3A%7B%7D%2C%22EXTEND_PROTOTYPES%22%3A%7B%22Date%22%3Afalse%7D%2C%22_APPLICATION_TEMPLATE_WRAPPER%22%3Afalse%2C%22_DEFAULT_ASYNC_OBSERVERS%22%3Atrue%2C%22_JQUERY_INTEGRATION%22%3Afalse%2C%22_TEMPLATE_ONLY_GLIMMER_COMPONENTS%22%3Atrue%7D%2C%22APP%22%3A%7B%22name%22%3A%22ember-app%22%2C%22version%22%3A%220.0.0%2Bf4c67075%22%7D%2C%22exportApplicationGlobal%22%3Atrue%7D',
        },
      ],
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      childNodes: [],
      parentNode: node,
    });
  }

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
