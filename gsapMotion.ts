import gsap from 'gsap'

function motionAllowed(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function animateEntrance(root: HTMLElement | null, selector: string): () => void {
  if (!root || !motionAllowed()) return () => undefined
  const items = gsap.utils.toArray<HTMLElement>(selector, root)
  if (!items.length) return () => undefined
  const ctx = gsap.context(() => {
    gsap.fromTo(items, { autoAlpha: 0, y: 14 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.48,
      stagger: 0.055,
      ease: 'power2.out',
      clearProps: 'transform,opacity,visibility',
    })
  }, root)
  return () => ctx.revert()
}

export function bindCardLift(root: HTMLElement | null, selector = '[data-motion-card]'): () => void {
  if (!root || !motionAllowed()) return () => undefined
  const cards = gsap.utils.toArray<HTMLElement>(selector, root)
  const cleanups: (() => void)[] = []
  cards.forEach((card) => {
    const enter = () => gsap.to(card, { y: -3, duration: 0.24, ease: 'power2.out', overwrite: true })
    const leave = () => gsap.to(card, { y: 0, duration: 0.28, ease: 'power2.out', overwrite: true })
    card.addEventListener('mouseenter', enter)
    card.addEventListener('mouseleave', leave)
    cleanups.push(() => {
      card.removeEventListener('mouseenter', enter)
      card.removeEventListener('mouseleave', leave)
    })
  })
  return () => cleanups.forEach((cleanup) => cleanup())
}
