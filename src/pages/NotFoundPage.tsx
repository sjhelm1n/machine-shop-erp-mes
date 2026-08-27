import { Link } from 'react-router-dom'
import { Button } from '../components/Ui'

export function NotFoundPage() {
  return <main className="not-found"><span>404</span><h1>That page isn’t on the traveler.</h1><p>The link may be old or you may not have access.</p><Link to="/"><Button>Return home</Button></Link></main>
}
