CREATE TABLE `allowedEmails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`invitedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `allowedEmails_id` PRIMARY KEY(`id`),
	CONSTRAINT `allowedEmails_email_unique` UNIQUE(`email`)
);

CREATE TABLE IF NOT EXISTS `googleTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(64) NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`expiresAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `googleTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `googleTokens_userId_unique` UNIQUE(`userId`)
);
