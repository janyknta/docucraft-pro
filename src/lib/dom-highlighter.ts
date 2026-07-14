export interface Highlight {
  id: string;
  fileId: string;
  text: string;
  color: string;
}

export function applyHighlightsToDOM(container: HTMLElement, highlights: Highlight[]) {
  // First, remove existing custom marks to avoid nested marks on re-renders
  const existingMarks = container.querySelectorAll("mark[data-highlight-id]");
  existingMarks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  });

  // Normalize container to merge adjacent text nodes
  container.normalize();

  if (highlights.length === 0) return;

  // Apply highlights
  highlights.forEach((hl) => {
    if (!hl.text.trim()) return;

    // Use a TreeWalker to find all text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const nodesToProcess: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      nodesToProcess.push(node as Text);
    }

    nodesToProcess.forEach((textNode) => {
      let textContent = textNode.textContent || "";
      let index = textContent.toLowerCase().indexOf(hl.text.toLowerCase());

      while (index !== -1) {
        // Split the node before the match
        const matchNode = textNode.splitText(index);
        // Split the match node after the match length
        matchNode.splitText(hl.text.length);

        // Create the mark element
        const mark = document.createElement("mark");
        mark.setAttribute("data-highlight-id", hl.id);
        mark.style.backgroundColor = hl.color;
        mark.style.color = "#000000"; // ensure readability on light background colors in dark mode
        mark.style.cursor = "pointer";
        mark.title = "Click to remove highlight";
        mark.textContent = matchNode.textContent;

        // Replace matchNode with mark
        matchNode.parentNode?.replaceChild(mark, matchNode);

        // The remaining text node is now the next sibling of the mark
        textNode = mark.nextSibling as Text;
        if (!textNode) break;

        textContent = textNode.textContent || "";
        index = textContent.toLowerCase().indexOf(hl.text.toLowerCase());
      }
    });
  });
}
