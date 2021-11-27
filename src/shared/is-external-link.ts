export function isExternalLink(url: string): boolean {
  const linkHost = ((url) => {
    if (/^\w*:\/\//.test(url)) {
      const parser = document.createElement('a');
      parser.href = url;

      return parser.hostname;
    } else {
      return window.location.hostname;
    }
  })(url);

  return window.location.hostname !== linkHost;
}
