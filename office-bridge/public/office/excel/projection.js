export function cellAddress(rowIndex, columnIndex) {
  let value = Number(columnIndex) + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return `${name}${Number(rowIndex) + 1}`;
}

export function projectRange(values, { rowIndex = 0, columnIndex = 0 } = {}) {
  const rows = Array.isArray(values) ? values : [];
  const cells = [];
  const lines = [];
  let offset = 0;
  rows.forEach((row, rowOffset) => {
    const valuesInRow = Array.isArray(row) ? row : [];
    const line = [];
    valuesInRow.forEach((value, cellOffset) => {
      const text = value == null ? '' : String(value);
      const start = offset;
      const end = start + text.length;
      cells.push({
        row: rowOffset,
        column: cellOffset,
        rowIndex: Number(rowIndex) + rowOffset,
        columnIndex: Number(columnIndex) + cellOffset,
        address: cellAddress(Number(rowIndex) + rowOffset, Number(columnIndex) + cellOffset),
        text,
        start,
        end,
      });
      line.push(text);
      offset = end;
      if (cellOffset < valuesInRow.length - 1) offset += 1;
    });
    lines.push(line.join('\t'));
    offset += 1;
  });
  return { text: lines.join('\n'), cells };
}

export function cellForMatch(projection, match) {
  const start = Number(match?.offset);
  const length = Number(match?.length);
  const end = start + length;
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0) return null;
  return projection.cells.find((cell) => start >= cell.start && end <= cell.end) || null;
}
