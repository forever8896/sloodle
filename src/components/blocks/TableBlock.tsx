import { useId } from "react";
import { BlockHeader, Inline, type BlockProps } from "./parts";

function TableBlock({ component }: BlockProps<"table">) {
  const captionId = useId();
  const [corner, ...headings] = component.columns;
  return (
    <figure className="content-card block block-table">
      <BlockHeader component={component} />
      {/* The scroller takes focus so a wide table can be scrolled with the keyboard. */}
      <div className="block-table-scroll" tabIndex={0} role="region" aria-labelledby={captionId}>
        <table>
          <caption id={captionId}>{component.caption ?? component.title ?? "Comparison"}</caption>
          <thead>
            <tr>
              <th scope="col">{corner ? <Inline text={corner} /> : <span className="block-sr">Item</span>}</th>
              {headings.map((heading) => (
                <th scope="col" key={heading}>
                  <Inline text={heading} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {component.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  <Inline text={row.label} />
                </th>
                {row.cells.map((cell, index) => (
                  <td key={`${headings[index]}-${cell}`}>
                    <Inline text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export { TableBlock };
