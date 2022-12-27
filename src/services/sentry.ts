import axios from "axios"
import { stripIndents } from "common-tags"
import RE2 from "re2"
import { BlacklistReasonKey, BlacklistResponse, DangerousDiscordBadges } from "../types/apis"
import { log } from "./logger"

// eslint-disable-next-line security/detect-unsafe-regex
const inviteRegex = new RE2(/((?:https?:\/\/)?discord(?:(?:app)?.com\/invite\/|.gg\/)[A-Za-z0-9]{2,})/gmi)
const idRegex = new RE2(/([0-9]{17,20})/gmi)


const friskyAPIURL = "https://api.extrafrisky.dev/api/v1"
const blacklisterAPIURL = "https://api.blacklister.xyz"
const dangerousDiscordAPIURL = "https://dangercord.com/api/v1"
const phishGGAPIURL = "https://api.phish.gg"

/**
 * Gets advanced information about a target like a invite via an API.
 * @class
 */
class Sentry {
	/**
	 * Checks if a user is blacklisted against all known blacklists.
	 * @param {string} userId The user id to check.
	 * @returns {BlacklistResponse} The responses from the APIs.
	 */
	public static async isBlacklistedUser(userId: string): Promise<BlacklistResponse> {

		let friskyBlacklisted: boolean | null = false
		let friskyBlacklistedReason = ""

		let blacklisterBlacklisted = false
		let blacklisterBlacklistedReason = ""
		let blacklisterBlacklistedEvidence = ""

		let dangerousDiscordReports: string | number = 0
		let dangerousDiscordBadges: DangerousDiscordBadges = {}
		let dangerousDiscordVotes = {
			upvotes: 0,
			downvotes: 0
		}
		let dangerousDiscordFlags = {
			spammer: false
		}

		// ExtraFrisky

		await axios.get(`${friskyAPIURL}/scammers/detailed/${userId}`, {
			headers: {
				"User-Agent": `ARIA - Private Discord Bot - ${process.env.OWNER_ID}`,
				"Authorization": `${process.env.FRISKY_API_KEY}`
			}
		})
			.then((res) => {
				switch (res.status) {
				case 204:
					friskyBlacklisted = false
					break
				case 200:
					friskyBlacklisted = true
					friskyBlacklistedReason = res.data.user.add_reason
					break
				default:
					friskyBlacklisted = null
					friskyBlacklistedReason = `API Error: ${res.status} ${res.statusText}`
					break
				}
			})
			.catch((err) => {
				log.error(err, "Error while checking if user is blacklisted on ExtraFrisky.")
				friskyBlacklisted = null
				friskyBlacklistedReason = `API Error: ${err}`
			})

		// Blacklister

		await axios.get(`${blacklisterAPIURL}/${userId}`, {
			headers: {
				"User-Agent": `ARIA - Private Discord Bot - ${process.env.OWNER_ID}`,
				"Authorization": `${process.env.BLACKLISTER_API_KEY}`
			}
		})
			.then((res) => {
				if (res.status !== 200) {
					blacklisterBlacklisted = false
					blacklisterBlacklistedReason = `API Error: ${res.status} ${res.statusText}`
					blacklisterBlacklistedEvidence = ""
				}

				if (res.data.blacklisted) {
					blacklisterBlacklisted = true
					blacklisterBlacklistedReason = res.data.reason
					blacklisterBlacklistedEvidence = res.data.evidence
				} else {
					blacklisterBlacklisted = false
					blacklisterBlacklistedReason = ""
					blacklisterBlacklistedEvidence = ""
				}
			})
			.catch((err) => {
				log.error(err, "Error while checking if user is blacklisted on Blacklister.")
				blacklisterBlacklisted = false
				blacklisterBlacklistedReason = `API Error: ${err}`
				blacklisterBlacklistedEvidence = ""
			})

		// DangerousDiscord

		await axios.get(`${dangerousDiscordAPIURL}/user/${userId}`, {
			headers: {
				"User-Agent": `ARIA - Private Discord Bot - ${process.env.OWNER_ID}`,
				"Authorization": `Bearer ${process.env.DANGEROUS_DISCORD_API_KEY}`
			}
		})
			.then((res) => {
				if (res.status !== 200) {
					dangerousDiscordReports = 0
					dangerousDiscordBadges = {}
					dangerousDiscordVotes = {
						upvotes: 0,
						downvotes: 0
					}
					dangerousDiscordFlags = {
						spammer: false
					}
				}

				dangerousDiscordReports = res.data.reports
				dangerousDiscordBadges = res.data.badges
				dangerousDiscordVotes = res.data.votes
				dangerousDiscordFlags = (res.data.flags || { spammer: false })
			})
			.catch((err) => {
				log.error(err, "Error while checking if user is blacklisted on DangerousDiscord.")
				dangerousDiscordReports = `API Error: ${err}`
				dangerousDiscordBadges = {}
				dangerousDiscordVotes = {
					upvotes: 0,
					downvotes: 0
				}
				dangerousDiscordFlags = {
					spammer: false
				}
			})

		if (blacklisterBlacklistedEvidence === ("https://capy-cdn.xyz/no-evidence.png" || "https://evidence.blacklister.xyz/no-evidence.png")) {
			blacklisterBlacklistedEvidence = "No evidence provided."
		}

		
		const dangerousDiscordBadBadges = Object.assign({}, dangerousDiscordBadges)
		delete dangerousDiscordBadBadges.whitelisted
		let dangerous = false
		
		if (friskyBlacklisted || blacklisterBlacklisted || dangerousDiscordReports > 0 || Object.keys(dangerousDiscordBadBadges).length > 0 || dangerousDiscordFlags.spammer) {
			dangerous = true
		}

		return {
			frisky: {
				blacklisted: friskyBlacklisted,
				reason: friskyBlacklistedReason
			},
			blacklister: {
				blacklisted: blacklisterBlacklisted,
				reason: blacklisterBlacklistedReason,
				evidence: blacklisterBlacklistedEvidence
			},
			dangerousDiscord: {
				reports: dangerousDiscordReports,
				badges: dangerousDiscordBadges,
				votes: {
					upvotes: dangerousDiscordVotes.upvotes,
					downvotes: dangerousDiscordVotes.downvotes
				},
				flags: dangerousDiscordFlags
			},
			dangerous: dangerous
		}
	}

	/**
	 * Formats the blacklist response into a string.
	 * @param {BlacklistResponse} blacklistResponse The response from the APIs.
	 * @returns {string} The formatted blacklist response.
	 */
	public static formatBlacklistResponse(blacklistResponse: BlacklistResponse): string {
		const checkEmoji = "<:check:1043294381588877445>"
		const warnEmoji = "<:red_shield:1043294200529166386>"

		let friskyString = ""
		let blacklisterString = ""
		let dangerousDiscordString = ""
		let dangerousDiscordBadgesString = ""

		switch (blacklistResponse.frisky.blacklisted) {
		case true:
			friskyString = stripIndents`
					${warnEmoji} **ExtraFrisky**
					> **Reason:** ${blacklistResponse.frisky.reason}
				`
			break
		case false:
			friskyString = `${checkEmoji} **ExtraFrisky** OK`
			break
		}

		switch (blacklistResponse.blacklister.blacklisted) {
		case true:
			blacklisterString = stripIndents`
				${warnEmoji} **Blacklister**
				> **Reason:** ${blacklistResponse.blacklister.reason}
				> **Evidence:** ${blacklistResponse.blacklister.evidence}
			`
			break
		case false:
			blacklisterString = `${checkEmoji} **Blacklister** OK`
		}

		for (const badge in blacklistResponse.dangerousDiscord.badges) {
			switch (badge) {
			case "blacklisted":
				dangerousDiscordBadgesString += "<:blacklisted:1004497537002110976> Blacklisted,"
				break
			case "whitelisted":
				dangerousDiscordBadgesString += "<:whitelisted:1004497202246336603> Whitelisted,"
				break
			case "raid_bot":
				dangerousDiscordBadgesString += "<:raidbot:1004497197863288892> Raid Bot,"
				break
			case "scam_bot":
				dangerousDiscordBadgesString += "<:scambot:1004497195447361636> Scam Bot,"
				break
			default:
				dangerousDiscordBadgesString += "No badges."
			}
		}

		const votes = `<:upvote:1004497193283109114> ${blacklistResponse.dangerousDiscord.votes.upvotes || "0"
		} <:downvote:1004497191307583508> ${blacklistResponse.dangerousDiscord.votes.downvotes || "0"
		}`

		const flags =
			blacklistResponse.dangerousDiscord.flags &&
				blacklistResponse.dangerousDiscord.flags.spammer
				? "<:spammer:1004497199863967794> Spammer"
				: "No flags."

		const dangerousDiscordEmoji = blacklistResponse.dangerous ? warnEmoji : checkEmoji
		
		dangerousDiscordString += stripIndents`
				${dangerousDiscordEmoji} **DangerousDiscord**
				> **Reports:** ${blacklistResponse.dangerousDiscord.reports}
				> **Badges:** ${dangerousDiscordBadgesString || "No badges."}
				> **Votes:** ${votes}
				> **Flags:** ${flags}
			`

		return stripIndents`
				${friskyString}
				${blacklisterString}
				${dangerousDiscordString}
			`
	}

	/**
	 * Checks if a guild is blacklisted.
	 * @param guildId The guild ID.
	 * @returns 
	 */
	public static async isBlacklistedGuild(guildId: string) {

		return await axios.get(`${phishGGAPIURL}/server?id=${guildId}`)
			.then((res) => {
				if (res.status !== 200) {
					return `Unable to check blacklist status. Status code: ${res.status}`
				}

				if (res.data.match) {
					return `This server is blacklisted for '${res.data.reason}'`
				} else {
					return false
				}
			})
			.catch((err) => {
				return `Unable to check blacklist status. Error: ${err}`
			})

	}

	/**
	 * Blacklists a guild.
	 * @param guildResolvable The guild ID or invite code.
	 * @param reasonKey The reason key.
	 * @returns {Promise<boolean | Error>} Whether the guild was blacklisted or not.
	 */
	public static async blacklistGuild(guildResolvable: string, reasonKey: BlacklistReasonKey): Promise<boolean | Error> {

		let inputType: "invite" | "id" | null = null

		if (inviteRegex.match(guildResolvable)) {
			inputType = "invite"
		} else if (idRegex.match(guildResolvable)) {
			inputType = "id"
		}

		if (!inputType) {
			return Error("Invalid input type.")
		}

		const body = {
			[inputType]: guildResolvable,
			key: reasonKey
		}

		return await axios.post(`${phishGGAPIURL}/add-server`, {
			body: body,
			headers: {
				"User-Agent": `ARIA - Private Discord Bot - ${process.env.OWNER_ID}`,
				"Authorization": `${process.env.PHISHGG_API_KEY}`
			}
		})
			.then((res) => {
				if (res.status !== 200) {
					return Error(`Error: ${res.status} ${res.statusText}`)
				}

				if (res.data.err) {
					return Error(res.data.err)
				}

				return true
			})
			.catch((err) => {
				return Error(err)
			})
	}
}

export default Sentry