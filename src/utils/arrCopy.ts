// http://jsperf.com/copy-array-inline
export default function arrCopy<T>(
  arr: ArrayLike<T>,
  offset?: number
): Array<T> {
  offset = offset || 0;
  const len = Math.max(0, arr.length - offset);
  const newArr: Array<T> = new Array(len);
  for (let ii = 0; ii < len; ii++) {
    // In-bounds by construction (ii < len === arr.length - offset).
    newArr[ii] = arr[ii + offset]!;
  }
  return newArr;
}
