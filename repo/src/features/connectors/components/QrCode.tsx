import { useMemo } from 'react'
import { renderSVG } from 'uqr'

export function QrCode({ value }: { value: string }) {
  const svg = useMemo(
    () =>
      renderSVG(value, {
        ecc: 'M',
        border: 2,
        pixelSize: 6,
        whiteColor: '#ffffff',
        blackColor: '#000000',
      }),
    [value],
  )
  return <div className="qr-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
}
