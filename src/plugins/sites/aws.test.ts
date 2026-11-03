import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import aws, { consoleUrl, lambdaFunction, regionOf, switchRegion } from "./aws"

const EC2 = "https://eu-west-1.console.aws.amazon.com/ec2/home?region=eu-west-1#Instances:"
const LAMBDA = "https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions/checkout-api?tab=code"
const IAM = "https://console.aws.amazon.com/iam/home#/roles"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("aws", () => {
  it("runs on the console and regional consoles only", async () => {
    expect(await commandsFor(aws, IAM)).not.toEqual([])
    expect(await commandsFor(aws, EC2)).not.toEqual([])
    expect(await commandsFor(aws, "https://console.aws.amazon.com.evil.com/ec2/home")).toEqual([])
    expect(await commandsFor(aws, "https://evilconsole.aws.amazon.com/ec2/home")).toEqual([])
    expect(await commandsFor(aws, "https://aws.amazon.com/ec2/")).toEqual([])
    expect(await commandsFor(aws, "https://www.amazon.com/dp/B0CHWRXH8B")).toEqual([])
  })

  it("reads the region from region= or the subdomain", () => {
    expect(regionOf(new URL(EC2))).toBe("eu-west-1")
    expect(regionOf(new URL("https://console.aws.amazon.com/ec2/home?region=ap-southeast-2"))).toBe("ap-southeast-2")
    expect(regionOf(new URL("https://us-west-2.console.aws.amazon.com/cloudwatch/home#logsV2:"))).toBe("us-west-2")
    expect(regionOf(new URL(IAM))).toBeUndefined()
    expect(regionOf(new URL("https://console.aws.amazon.com/s3/home?region=nope"))).toBeUndefined()
  })

  it("switches region on the same page, updating the subdomain and region=", () => {
    expect(switchRegion(new URL(EC2), "us-east-2")).toBe(
      "https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#Instances:",
    )
    expect(switchRegion(new URL("https://console.aws.amazon.com/ec2/home?region=us-east-1"), "eu-central-1")).toBe(
      "https://eu-central-1.console.aws.amazon.com/ec2/home?region=eu-central-1",
    )
    expect(switchRegion(new URL(LAMBDA), "eu-west-1")).toBe(
      "https://eu-west-1.console.aws.amazon.com/lambda/home?region=eu-west-1#/functions/checkout-api?tab=code",
    )
  })

  it("lists regions with the current one marked", async () => {
    const picker = (await commandsFor(aws, EC2)).find((i) => i.id === "switch-region")!
    expect(picker.subtitle).toBe("eu-west-1")
    const regions = await picker.children!.items(context(EC2))
    expect(regions.length).toBeGreaterThan(30)
    expect(regions[0].title).toBe("us-east-1 · N. Virginia")
    expect(regions.filter((r) => r.hint).map((r) => r.id)).toEqual(["region-eu-west-1"])
    await run(regions, "region-us-west-2")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: "https://us-west-2.console.aws.amazon.com/ec2/home?region=us-west-2#Instances:",
    })
  })

  it("jumps to services in the current region, and to global ones", async () => {
    const items = await commandsFor(aws, EC2)
    expect(items.every((i) => i.group === "AWS Console")).toBe(true)
    await run(items, "lambda")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, {
      url: "https://eu-west-1.console.aws.amazon.com/lambda/home?region=eu-west-1#/functions",
    })
    await run(items, "iam")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://console.aws.amazon.com/iam/home" })
    await items.find((i) => i.id === "cost-explorer")!.actions![0].run(context(EC2))
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://console.aws.amazon.com/costmanagement/home#/cost-explorer",
    })
    expect(consoleUrl("/ec2/home")).toBe("https://console.aws.amazon.com/ec2/home")
  })

  it("copies the region code", async () => {
    const { copied } = await run(await commandsFor(aws, EC2), "copy-region")
    expect(copied).toEqual(["eu-west-1"])
    expect((await commandsFor(aws, IAM)).some((i) => i.id === "copy-region")).toBe(false)
  })

  it("copies the Lambda function name first on a function page", async () => {
    expect(lambdaFunction(new URL(LAMBDA))).toBe("checkout-api")
    expect(lambdaFunction(new URL("https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions"))).toBeUndefined()
    const items = await commandsFor(aws, LAMBDA)
    expect(titles(items).slice(0, 3)).toEqual(["Copy function name", "Switch region…", "Copy region code"])
    const { copied } = await run(items, "lambda-name")
    expect(copied).toEqual(["checkout-api"])
  })
})
