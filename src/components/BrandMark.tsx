import { getBrandIconUrl } from '../brand';

export default function BrandMark() {
  return (
    <img
      className="brand-mark"
      src={getBrandIconUrl()}
      alt=""
      width={40}
      height={40}
      aria-hidden="true"
    />
  );
}
