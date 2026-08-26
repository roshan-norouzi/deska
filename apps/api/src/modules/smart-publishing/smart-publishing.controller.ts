import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RequireModule } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateFeedDto, UpdateFeedDto } from './dto/feed.dto';
import { UpdateNewsArticleDto } from './dto/news-article.dto';
import { TestPublishingConnectionDto, UpdatePublishingSettingsDto } from './dto/publishing-settings.dto';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SmartPublishingService } from './smart-publishing.service';
import { WordPressClient } from './wordpress.client';

@Controller('publishing')
@UseGuards(JwtAuthGuard, TenantGuard, ModuleEnabledGuard)
@RequireModule('smart-publishing')
export class SmartPublishingController {
  constructor(
    private readonly service: SmartPublishingService,
    private readonly newsroom: NewsroomService,
    private readonly settingsService: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly wordpress: WordPressClient,
  ) {}

  @Get('settings') settings(@TenantCtx() tenant: TenantContext) { return this.settingsService.getPublic(tenant.tenantId); }
  @Put('settings') saveSettings(@TenantCtx() tenant: TenantContext, @Body() body: UpdatePublishingSettingsDto) { return this.settingsService.save(tenant.tenantId, body); }
  @Post('settings/test-gapgpt') async testGapGpt(@TenantCtx() tenant: TenantContext, @Body() body: TestPublishingConnectionDto) { return this.gapGpt.test(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }
  @Post('settings/test-wordpress') async testWordPress(@TenantCtx() tenant: TenantContext, @Body() body: TestPublishingConnectionDto) { return this.wordpress.test(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }

  @Get('channels') channels(@TenantCtx() tenant: TenantContext) { return this.service.channels(tenant.tenantId); }
  @Post('channels') createChannel(@TenantCtx() tenant: TenantContext, @Body() body: Record<string, unknown>) { return this.service.createChannel(tenant.tenantId, body); }
  @Get('articles') articles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.service.articles(tenant.tenantId, status); }
  @Post('articles') createArticle(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Body() body: Record<string, unknown>) { return this.service.createArticle(tenant.tenantId, user.id, body); }
  @Post('articles/:id/publish') publish(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.service.publish(tenant.tenantId, id); }

  @Get('feeds') feeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId); }
  @Post('feeds') addFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, body); }
  @Patch('feeds/:id') updateFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('feeds/:id/toggle') toggleFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('feeds/:id') deleteFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('feeds/:id/fetch') fetchFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }

  @Get('news/feeds') newsFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId, 'news-room'); }
  @Post('news/feeds') addNewsFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'news-room' }); }
  @Patch('news/feeds/:id') updateNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('news/feeds/:id/toggle') toggleNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('news/feeds/:id') deleteNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/fetch') fetchNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('news/sync') syncNews(@TenantCtx() tenant: TenantContext) { return this.newsroom.sync(tenant.tenantId); }
  @Get('news/articles') newsArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.newsroom.articles(tenant.tenantId, status); }
  @Post('news/articles/:id/summarize') summarize(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.summarize(tenant.tenantId, id); }
  @Post('news/articles/:id/reject') reject(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.reject(tenant.tenantId, id); }
  @Post('news/articles/:id/publish') publishNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.publish(tenant.tenantId, id); }
  @Patch('news/articles/:id') updateNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateNewsArticleDto) { return this.newsroom.updateArticle(tenant.tenantId, id, body); }

  @Get('social/feeds') socialFeeds(@TenantCtx() tenant: TenantContext) { return this.service.socialFeeds(tenant.tenantId); }
  @Post('social/feeds') addSocialFeed(@TenantCtx() tenant: TenantContext, @Body() body: Record<string, unknown>) { return this.service.addSocialFeed(tenant.tenantId, body); }
  @Get('social/articles') socialArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.service.socialArticles(tenant.tenantId, status); }
  @Patch('social/articles/:id/rewrite') rewrite(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: { rewrittenText?: string }) { return this.service.rewriteSocialArticle(tenant.tenantId, id, String(body.rewrittenText ?? '')); }
}
