import { Separator } from '@/components/ui/separator'

export function Footer() {
  return (
    <footer className="max-w-[900px] mx-auto px-4 md:px-6 w-full py-8">
      <Separator className="mb-4" />
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-sm text-muted-foreground">
          © 2024 P2P Escrow. All rights reserved.
        </p>
        <div className="flex gap-4">
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Terms
          </a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </a>
        </div>
      </div>
    </footer>
  )
}
