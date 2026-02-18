import { useState, useEffect } from 'react';

export default function useVisualViewport() {
  const [height, setHeight] = useState(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // When keyboard is open, visualViewport.height < window.innerHeight
      setHeight(Math.floor(vv.height) + 'px');
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return height;
}
