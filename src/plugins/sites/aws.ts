import {
  Activity,
  Copy,
  Container,
  Database,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  PiggyBank,
  Receipt,
  Server,
  Signpost,
  Table,
  Zap,
} from "lucide-react"
import type { Command, Icon } from "@/core/types"
import { copy, defineSite, hostIs, navigate, withParams } from "../site-kit"

const CONSOLE = "console.aws.amazon.com"

/** Standard commercial regions: code, short name, area. GovCloud and China use other domains. */
export const REGIONS: [code: string, name: string, area: string][] = [
  ["us-east-1", "N. Virginia", "US East"],
  ["us-east-2", "Ohio", "US East"],
  ["us-west-1", "N. California", "US West"],
  ["us-west-2", "Oregon", "US West"],
  ["af-south-1", "Cape Town", "Africa"],
  ["ap-east-1", "Hong Kong", "Asia Pacific"],
  ["ap-east-2", "Taipei", "Asia Pacific"],
  ["ap-south-1", "Mumbai", "Asia Pacific"],
  ["ap-south-2", "Hyderabad", "Asia Pacific"],
  ["ap-southeast-1", "Singapore", "Asia Pacific"],
  ["ap-southeast-2", "Sydney", "Asia Pacific"],
  ["ap-southeast-3", "Jakarta", "Asia Pacific"],
  ["ap-southeast-4", "Melbourne", "Asia Pacific"],
  ["ap-southeast-5", "Malaysia", "Asia Pacific"],
  ["ap-southeast-6", "New Zealand", "Asia Pacific"],
  ["ap-southeast-7", "Thailand", "Asia Pacific"],
  ["ap-northeast-1", "Tokyo", "Asia Pacific"],
  ["ap-northeast-2", "Seoul", "Asia Pacific"],
  ["ap-northeast-3", "Osaka", "Asia Pacific"],
  ["ca-central-1", "Central", "Canada"],
  ["ca-west-1", "Calgary", "Canada West"],
  ["eu-central-1", "Frankfurt", "Europe"],
  ["eu-central-2", "Zurich", "Europe"],
  ["eu-west-1", "Ireland", "Europe"],
  ["eu-west-2", "London", "Europe"],
  ["eu-west-3", "Paris", "Europe"],
  ["eu-south-1", "Milan", "Europe"],
  ["eu-south-2", "Spain", "Europe"],
  ["eu-north-1", "Stockholm", "Europe"],
  ["il-central-1", "Tel Aviv", "Israel"],
  ["me-south-1", "Bahrain", "Middle East"],
  ["me-central-1", "UAE", "Middle East"],
  ["mx-central-1", "Central", "Mexico"],
  ["sa-east-1", "São Paulo", "South America"],
]

const REGION = /^[a-z]{2}(?:-[a-z]+)+-\d+$/

/** Subdomain labels before console.aws.amazon.com: "us-east-1.console.aws.amazon.com" → ["us-east-1"] */
const labels = (url: URL) => url.hostname.slice(0, -CONSOLE.length).split(".").filter(Boolean)

/** The console region, from `region=` or the regional subdomain. */
export function regionOf(url: URL): string | undefined {
  const param = url.searchParams.get("region")
  if (param && REGION.test(param)) return param
  const sub = labels(url).at(-1)
  return sub && REGION.test(sub) ? sub : undefined
}

/** The same console page in another region: swaps the regional subdomain and `region=`. */
export function switchRegion(url: URL, region: string) {
  const next = new URL(url)
  const parts = labels(url)
  if (parts.length && REGION.test(parts.at(-1)!)) parts[parts.length - 1] = region
  else parts.push(region)
  next.hostname = [...parts, CONSOLE].join(".")
  return withParams(next, { region })
}

/** A console page, in `region` if given: `https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1` */
export function consoleUrl(path: string, region?: string, hash = "") {
  return region ? `https://${region}.${CONSOLE}${path}?region=${region}${hash}` : `https://${CONSOLE}${path}${hash}`
}

/** The Lambda function in `#/functions/<name>`, e.g. `#/functions/checkout-api?tab=code`. */
export function lambdaFunction(url: URL): string | undefined {
  if (!url.pathname.startsWith("/lambda/")) return undefined
  const match = url.hash.match(/^#\/functions\/([^/?#]+)/)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

interface Service {
  id: string
  title: string
  path: string
  hash?: string
  /** Global services don't take a region. */
  global?: boolean
  icon: Icon
  keywords: string[]
}

const SERVICES: Service[] = [
  { id: "ec2", title: "EC2", path: "/ec2/home", icon: Server, keywords: ["instances", "Elastic Compute Cloud"] },
  { id: "s3", title: "S3", path: "/s3/home", global: true, icon: HardDrive, keywords: ["buckets", "storage"] },
  { id: "lambda", title: "Lambda", path: "/lambda/home", hash: "#/functions", icon: Zap, keywords: ["functions", "serverless"] },
  { id: "cloudwatch", title: "CloudWatch", path: "/cloudwatch/home", icon: Activity, keywords: ["logs", "metrics", "alarms"] },
  { id: "iam", title: "IAM", path: "/iam/home", global: true, icon: KeyRound, keywords: ["users", "roles", "policies"] },
  { id: "rds", title: "RDS", path: "/rds/home", icon: Database, keywords: ["databases", "postgres", "mysql", "aurora"] },
  { id: "dynamodb", title: "DynamoDB", path: "/dynamodb/home", icon: Table, keywords: ["tables", "nosql"] },
  { id: "ecs", title: "ECS", path: "/ecs/v2", icon: Container, keywords: ["containers", "clusters", "fargate"] },
  { id: "cloudformation", title: "CloudFormation", path: "/cloudformation/home", icon: Layers, keywords: ["stacks"] },
  { id: "route53", title: "Route 53", path: "/route53/", global: true, icon: Signpost, keywords: ["dns", "domains", "hosted zones"] },
  { id: "billing", title: "Billing", path: "/billing/home", hash: "#/bills", global: true, icon: Receipt, keywords: ["bills", "invoices"] },
  { id: "cost-explorer", title: "Cost Explorer", path: "/costmanagement/home", hash: "#/cost-explorer", global: true, icon: PiggyBank, keywords: ["costs", "spend"] },
]

function regionPicker(url: URL, current: string | undefined): Command {
  return {
    id: "switch-region",
    title: "Switch region…",
    subtitle: current,
    icon: Globe,
    keywords: ["region"],
    children: {
      placeholder: "Pick a region…",
      items: () =>
        REGIONS.map(([code, name, area]) =>
          navigate(`region-${code}`, `${code} · ${name}`, switchRegion(url, code), {
            icon: Globe,
            keywords: [area, name],
            hint: code === current ? "Current" : undefined,
          }),
        ),
    },
  }
}

export default defineSite({
  id: "aws",
  name: "AWS Console",
  description: "Switch regions, jump to common services, copy region codes and Lambda function names",
  url: "https://console.aws.amazon.com",
  matches: (url) => url.protocol === "https:" && hostIs(url, CONSOLE),

  commands({ url }) {
    const region = regionOf(url)
    const fn = lambdaFunction(url)
    const items: Command[] = []

    if (fn) items.push(copy("lambda-name", "Copy function name", fn, { icon: Copy }))
    items.push(regionPicker(url, region))
    if (region) items.push(copy("copy-region", "Copy region code", region, { icon: Copy }))
    for (const s of SERVICES) {
      const target = s.global ? consoleUrl(s.path, undefined, s.hash) : consoleUrl(s.path, region, s.hash)
      const subtitle = s.global ? "Global" : region
      items.push(navigate(s.id, s.title, target, { icon: s.icon, subtitle, keywords: s.keywords }))
    }
    return items
  },
})
