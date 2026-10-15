import { describe, expect, it } from 'vitest'
import {
  hasCodeOrTextExtension,
  isCodeOrTextFilePath,
  getCodeLanguageFromPath,
  MARKDOWN_INCLUSIONS
} from 'common/filesystem/paths'

describe('code and text file support in paths', () => {
  it('correctly detects various code and text file formats', () => {
    const formats = [
      'app.json',
      'docker-compose.yml',
      'config.yaml',
      'pom.xml',
      'Cargo.toml',
      'settings.ini',
      'app.conf',
      'config.cfg',
      'application.properties',
      '.env',
      '.env.local',
      '.env.production',
      '.gitignore',
      '.npmignore',
      '.dockerignore',
      '.editorconfig',
      'Dockerfile',
      'Makefile',
      'query.sql',
      'deploy.sh',
      'run.bash',
      'start.bat',
      'script.ps1',
      'index.html',
      'style.css',
      'main.py',
      'index.js',
      'app.ts',
      'app.log',
      'notes.txt'
    ]

    for (const filename of formats) {
      expect(hasCodeOrTextExtension(filename), `Expected ${filename} to be recognized`).toBe(true)
      expect(isCodeOrTextFilePath(`/project/${filename}`)).toBe(true)
    }
  })

  it('correctly maps code language', () => {
    expect(getCodeLanguageFromPath('/path/to/data.json')).toBe('json')
    expect(getCodeLanguageFromPath('/path/to/config.yaml')).toBe('yaml')
    expect(getCodeLanguageFromPath('/path/to/.env')).toBe('shell')
    expect(getCodeLanguageFromPath('/path/to/.env.local')).toBe('shell')
    expect(getCodeLanguageFromPath('/path/to/main.py')).toBe('python')
    expect(getCodeLanguageFromPath('/path/to/app.ts')).toBe('typescript')
    expect(getCodeLanguageFromPath('/path/to/index.html')).toBe('html')
    expect(getCodeLanguageFromPath('/path/to/script.sh')).toBe('shell')
    expect(getCodeLanguageFromPath('/path/to/query.sql')).toBe('sql')
    expect(getCodeLanguageFromPath('/path/to/readme.md')).toBe('text')
  })

  it('includes code and text extensions in MARKDOWN_INCLUSIONS', () => {
    expect(MARKDOWN_INCLUSIONS).toContain('*.json')
    expect(MARKDOWN_INCLUSIONS).toContain('*.yaml')
    expect(MARKDOWN_INCLUSIONS).toContain('*.py')
    expect(MARKDOWN_INCLUSIONS).toContain('*.ts')
    expect(MARKDOWN_INCLUSIONS).toContain('*.md')
    expect(MARKDOWN_INCLUSIONS).toContain('.env*')
  })
})
