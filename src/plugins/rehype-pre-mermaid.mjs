// Minimal build-time transform for ```mermaid code blocks: rewrites the
// fenced block's <pre><code class="language-mermaid"> into
// <pre class="mermaid"> carrying the raw diagram source, for client-side
// rendering by src/components/Head.astro.
//
// Equivalent to rehype-mermaid's 'pre-mermaid' strategy, without that
// package's top-level playwright import chain (which drags a headless
// browser into every install even when never used).
export default function rehypePreMermaid() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (
          child.type === 'element' &&
          child.tagName === 'pre' &&
          child.children?.length === 1 &&
          child.children[0].type === 'element' &&
          child.children[0].tagName === 'code' &&
          (child.children[0].properties?.className ?? []).includes(
            'language-mermaid',
          )
        ) {
          node.children[i] = {
            type: 'element',
            tagName: 'pre',
            properties: { className: ['mermaid'] },
            children: child.children[0].children,
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
