export function projectShapes(shapes) {
  const items = Array.isArray(shapes) ? shapes : [];
  const projected = [];
  let offset = 0;
  for (const shape of items) {
    const text = shape?.text == null ? '' : String(shape.text);
    const start = offset;
    const end = start + text.length;
    projected.push({
      ...shape,
      text,
      start,
      end,
      slideNumber: Number(shape?.slideNumber || 0),
      shapeId: String(shape?.shapeId || ''),
    });
    offset = end + 2;
  }
  return { text: projected.map((shape) => shape.text).join('\n\n'), shapes: projected };
}

export function shapeForMatch(projection, match) {
  const start = Number(match?.offset);
  const length = Number(match?.length);
  const end = start + length;
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0) return null;
  return projection.shapes.find((shape) => start >= shape.start && end <= shape.end) || null;
}
