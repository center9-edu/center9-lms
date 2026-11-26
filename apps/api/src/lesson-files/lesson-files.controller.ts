import { Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentSession, Roles } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/auth.dto.js';
import { contentDisposition, LessonFilesService, MAX_FILE_BYTES, PDF_TYPE } from './lesson-files.service.js';
import type { LessonFileDto, UploadedLessonFile } from './lesson-files.service.js';

// Same split as the curriculum: staff read, admins and teachers change it. Learners may download (see below).
@Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES')
@Controller()
export class LessonFilesController {
  constructor(private readonly files: LessonFilesService) {}

  /** multipart/form-data with one part named "file". Larger than 20 MB → 413 while still streaming in. */
  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
  @Post('lessons/:id/files')
  // Guards run before interceptors, so the body is read only for a signed-in author.
  // ponytail: multer's memory storage holds each upload (≤ 20 MB) in RAM; switch to disk storage if many uploads run at once.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 }, defParamCharset: 'utf8' }))
  upload(
    @CurrentSession() session: AuthContext,
    @Param('id', ParseUUIDPipe) lessonId: string,
    @UploadedFile() file: UploadedLessonFile | undefined,
  ): Promise<LessonFileDto> {
    return this.files.upload(session, lessonId, file);
  }

  /**
   * PDF opens in the page, DOCX downloads. Upload checked the first bytes and we set the type ourselves;
   * nosniff stops the browser from guessing another one. No `CSP: sandbox`: browsers' PDF viewers refuse to run in a sandbox.
   */
  // Learners too: the service lets them open only PDFs of lessons open in their own classes.
  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER', 'SALES', 'STUDENT', 'PARENT')
  @Get('lesson-files/:id')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async download(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { file, stream } = await this.files.open(session, id);
    return new StreamableFile(stream, {
      type: file.mimeType,
      length: file.sizeBytes,
      disposition: contentDisposition(file.mimeType === PDF_TYPE ? 'inline' : 'attachment', file.fileName),
    });
  }

  @Roles('SUPER_ADMIN', 'CENTER_ADMIN', 'TEACHER')
  @Delete('lesson-files/:id')
  @HttpCode(204)
  remove(@CurrentSession() session: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.files.remove(session, id);
  }
}
