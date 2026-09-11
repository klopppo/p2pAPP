import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Separator } from '@/components/ui/separator'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="px-4 md:px-6 w-full py-8">
      <Separator className="mb-4" />
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {t('footer.copyright')}
        </p>
        <div className="flex gap-4">
          <Link to="/docs/terms-of-service" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('footer.terms')}
          </Link>
          <Link to="/docs/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('footer.privacy')}
          </Link>
          <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('footer.docs')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
