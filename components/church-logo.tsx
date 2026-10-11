import Image from "next/image";

export default function ChurchLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      src="/branding/church-logo-orange.png"
      alt="City Church of Christ logo"
      width={size}
      height={size}
      sizes={`${size}px`}
      className="church-logo"
    />
  );
}
