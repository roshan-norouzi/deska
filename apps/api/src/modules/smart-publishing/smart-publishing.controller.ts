import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public, RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateFeedDto, UpdateFeedDto } from './dto/feed.dto';
import { UpdateNewsArticleDto } from './dto/news-article.dto';
import { TestGapGptConnectionDto, TestWordPressConnectionDto, UpdatePublishingSettingsDto } from './dto/publishing-settings.dto';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SmartPublishingService } from './smart-publishing.service';
import { WordPressClient } from './wordpress.client';
import { SocialStudioService } from './social-studio.service';
import { PublishSocialArticleDto, UpdateSocialCaptionDto, UpdateSocialLeadDto, UpdateSocialTitleDto } from './dto/social-article.dto';
import { CreatePublishArticleDto, CreatePublishChannelDto } from './dto/publish-content.dto';
import { SourceReaderService } from './source-reader.service';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { DailyReportService } from './daily-report.service';
import { AddDailyReportItemDto, CreateDailyReportDto, UpdateDailyReportDto } from './dto/daily-report.dto';

@Controller('publishing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('smart-publishing')
@RequirePermission('publishing.view')
export class SmartPublishingController {
  constructor(
    private readonly service: SmartPublishingService,
    private readonly newsroom: NewsroomService,
    private readonly settingsService: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly wordpress: WordPressClient,
    private readonly socialStudio: SocialStudioService,
    private readonly sourceReader: SourceReaderService,
    private readonly socialPublisher: SocialNetworkPublisherService,
    private readonly dailyReports: DailyReportService,
  ) {}

  @Get('settings') @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate') @Header('Pragma', 'no-cache') settings(@TenantCtx() tenant: TenantContext) { return this.settingsService.getPublic(tenant.tenantId); }
  @Put('settings') @RequirePermission('publishing.settings') saveSettings(@TenantCtx() tenant: TenantContext, @Body() body: UpdatePublishingSettingsDto) { return this.settingsService.save(tenant.tenantId, body); }
  @Post('settings/test-gapgpt') @RequirePermission('publishing.settings') async testGapGpt(@TenantCtx() tenant: TenantContext, @Body() body: TestGapGptConnectionDto) { return this.gapGpt.test(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }
  @Post('settings/gapgpt-models') @RequirePermission('publishing.settings') async gapGptModels(@TenantCtx() tenant: TenantContext, @Body() body: TestGapGptConnectionDto) { return this.gapGpt.models(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }
  @Post('settings/test-wordpress') @RequirePermission('publishing.settings') async testWordPress(@TenantCtx() tenant: TenantContext, @Body() body: TestWordPressConnectionDto) { return this.wordpress.test(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }
  @Post('settings/test-social/:network') @RequirePermission('publishing.settings') async testSocial(@TenantCtx() tenant: TenantContext, @Param('network') network: string, @Body() body: UpdatePublishingSettingsDto) { return this.socialPublisher.testConnection(tenant.tenantId, network, this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }
  @Post('settings/fonts') @RequirePermission('publishing.settings') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })) uploadFont(@TenantCtx() tenant: TenantContext, @UploadedFile() file: { originalname: string; buffer: Buffer }, @Body('name') name?: string) { return this.settingsService.addFont(tenant.tenantId, file, name); }
  @Delete('settings/fonts/:id') @RequirePermission('publishing.settings') removeFont(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.settingsService.removeFont(tenant.tenantId, id).then(() => ({ ok: true })); }
  @Post('settings/images') @RequirePermission('publishing.settings') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })) uploadCoverImage(@UploadedFile() file: { originalname: string; buffer: Buffer }) { return this.settingsService.addImage(file); }

  @Get('channels') channels(@TenantCtx() tenant: TenantContext) { return this.service.channels(tenant.tenantId); }
  @Post('channels') @RequirePermission('publishing.manage') createChannel(@TenantCtx() tenant: TenantContext, @Body() body: CreatePublishChannelDto) { return this.service.createChannel(tenant.tenantId, body); }
  @Get('articles') articles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.service.articles(tenant.tenantId, status); }
  @Post('articles') @RequirePermission('publishing.manage') createArticle(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Body() body: CreatePublishArticleDto) { return this.service.createArticle(tenant.tenantId, user.id, body); }
  @Post('articles/:id/publish') @RequirePermission('publishing.publish') publish(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.service.publish(tenant.tenantId, id); }

  @Get('feeds') feeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId); }
  @Post('feeds') @RequirePermission('publishing.manage') addFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, body); }
  @Patch('feeds/:id') @RequirePermission('publishing.manage') updateFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('feeds/:id/toggle') @RequirePermission('publishing.manage') toggleFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('feeds/:id') @RequirePermission('publishing.manage') deleteFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('feeds/:id/fetch') @RequirePermission('publishing.manage') fetchFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }

  @Get('news/feeds') newsFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId, 'news-room'); }
  @Post('news/feeds') @RequirePermission('publishing.manage') addNewsFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'news-room' }); }
  @Patch('news/feeds/:id') @RequirePermission('publishing.manage') updateNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('news/feeds/:id/toggle') @RequirePermission('publishing.manage') toggleNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('news/feeds/:id') @RequirePermission('publishing.manage') deleteNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/fetch') @RequirePermission('publishing.manage') fetchNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('news/sync') @RequirePermission('publishing.manage') syncNews(@TenantCtx() tenant: TenantContext) { return this.newsroom.sync(tenant.tenantId); }
  @Get('news/articles') newsArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.newsroom.articles(tenant.tenantId, status); }
  @Delete('news/articles') @RequirePermission('publishing.manage') deleteAllNewsArticles(@TenantCtx() tenant: TenantContext) { return this.newsroom.deleteAllArticles(tenant.tenantId); }
  @Post('news/articles/:id/summarize') @RequirePermission('publishing.manage') summarize(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.summarize(tenant.tenantId, id); }
  @Post('news/articles/:id/reject') @RequirePermission('publishing.manage') reject(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.reject(tenant.tenantId, id); }
  @Post('news/articles/:id/publish') @RequirePermission('publishing.publish') publishNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.publish(tenant.tenantId, id); }
  @Patch('news/articles/:id') @RequirePermission('publishing.manage') updateNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateNewsArticleDto) { return this.newsroom.updateArticle(tenant.tenantId, id, body); }

  @Get('daily-reports/overview') dailyReportOverview(@TenantCtx() tenant: TenantContext) { return this.dailyReports.overview(tenant.tenantId); }
  @Post('daily-reports/sync') @RequirePermission('publishing.manage') syncDailyReports(@TenantCtx() tenant: TenantContext) { return this.dailyReports.sync(tenant.tenantId); }
  @Post('daily-reports') @RequirePermission('publishing.manage') createDailyReport(@TenantCtx() tenant: TenantContext, @Body() body: CreateDailyReportDto) { return this.dailyReports.createReport(tenant.tenantId, body.reportDate); }
  @Patch('daily-reports/:reportId') @RequirePermission('publishing.manage') updateDailyReport(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Body() body: UpdateDailyReportDto) { return this.dailyReports.updateReport(tenant.tenantId, reportId, body.reportDate); }
  @Delete('daily-reports/:reportId') @RequirePermission('publishing.manage') deleteDailyReport(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string) { return this.dailyReports.deleteReport(tenant.tenantId, reportId); }
  @Post('daily-reports/:reportId/items') @RequirePermission('publishing.manage') addDailyReportItem(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Body() body: AddDailyReportItemDto) { return this.dailyReports.addItem(tenant.tenantId, reportId, body.articleId); }
  @Delete('daily-reports/:reportId/items/:itemId') @RequirePermission('publishing.manage') removeDailyReportItem(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Param('itemId') itemId: string) { return this.dailyReports.removeItem(tenant.tenantId, reportId, itemId); }
  @Post('daily-reports/:reportId/articles/:articleId/reject') @RequirePermission('publishing.manage') rejectDailyReportArticle(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Param('articleId') articleId: string) { return this.dailyReports.rejectArticle(tenant.tenantId, reportId, articleId); }
  @Delete('daily-reports/:reportId/articles/:articleId/reject') @RequirePermission('publishing.manage') restoreDailyReportArticle(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Param('articleId') articleId: string) { return this.dailyReports.restoreArticle(tenant.tenantId, reportId, articleId); }
  @Post('daily-reports/items/:itemId/prepare') @RequirePermission('publishing.manage') prepareDailyReportItem(@TenantCtx() tenant: TenantContext, @Param('itemId') itemId: string) { return this.dailyReports.prepareItem(tenant.tenantId, itemId); }
  @Post('daily-reports/:reportId/prepare-all') @RequirePermission('publishing.manage') prepareDailyReport(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string) { return this.dailyReports.prepareAll(tenant.tenantId, reportId); }

  @Get('social/feeds') socialFeeds(@TenantCtx() tenant: TenantContext) { return this.socialStudio.feeds(tenant.tenantId); }
  @Post('social/feeds/:id/fetch') @RequirePermission('publishing.manage') fetchSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.fetchFeed(tenant.tenantId, id); }
  @Post('social/sync') @RequirePermission('publishing.manage') syncSocial(@TenantCtx() tenant: TenantContext) { return this.socialStudio.sync(tenant.tenantId); }
  @Get('social/articles') socialArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.socialStudio.articles(tenant.tenantId, status); }
  @Delete('social/articles') @RequirePermission('publishing.manage') deleteAllSocialArticles(@TenantCtx() tenant: TenantContext) { return this.socialStudio.deleteAllArticles(tenant.tenantId); }
  @Post('social/articles/:id/prepare') @RequirePermission('publishing.manage') prepareSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.prepare(tenant.tenantId, id); }
  @Post('social/articles/:id/publish/:network') @RequirePermission('publishing.publish') publishSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Param('network') network: string, @Body() body: PublishSocialArticleDto) { return this.socialPublisher.publish(tenant.tenantId, id, network, body.caption, body.imageDataUrl); }
  @Get('media/image') async proxyImage(@Query('url') url: string, @Res() response: Response) { const result = await this.sourceReader.proxyImage(String(url || '')); response.setHeader('Content-Type', result.contentType); response.setHeader('Cache-Control', 'private, max-age=3600'); return response.send(result.buffer); }
  @Patch('social/articles/:id/rewrite') @RequirePermission('publishing.manage') rewrite(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateSocialCaptionDto) { return this.socialStudio.updateCaption(tenant.tenantId, id, body.rewrittenText); }
  @Patch('social/articles/:id/lead') @RequirePermission('publishing.manage') updateSocialLead(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateSocialLeadDto) { return this.socialStudio.updateLead(tenant.tenantId, id, body.leadText); }
  @Patch('social/articles/:id/title') @RequirePermission('publishing.manage') updateSocialTitle(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateSocialTitleDto) { return this.socialStudio.updateTitle(tenant.tenantId, id, body.title); }
}

@Public()
@Controller('publishing/settings/fonts/file')
export class PublishingFontFileController {
  constructor(private readonly settingsService: PublishingSettingsService) {}
  @Get(':filename') async file(@Param('filename') filename: string, @Res() response: Response) {
    const result = await this.settingsService.fontFile(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
}

@Public()
@Controller('publishing/settings/images/file')
export class PublishingImageFileController {
  constructor(private readonly settingsService: PublishingSettingsService) {}
  @Get(':filename') async file(@Param('filename') filename: string, @Res() response: Response) {
    const result = await this.settingsService.imageFile(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
}

@Public()
@Controller('publishing/social/media')
export class SocialPublishingMediaController {
  constructor(private readonly socialPublisher: SocialNetworkPublisherService) {}

  @Get(':filename')
  async file(@Param('filename') filename: string, @Res() response: Response) {
    const result = await this.socialPublisher.publicMedia(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=300');
    return response.send(result.buffer);
  }
}
