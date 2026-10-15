<template>
  <div class="normal-code-container">
    <div
      ref="normalCodeContainer"
      class="normal-code-editor"
    />
    <editor-search />
  </div>
</template>

<script setup lang="ts">
import { ref, markRaw, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { getOptionsFromState } from '@/store/help'
import codeMirror, { setCursorAtFirstLine } from '../../codeMirror'
import EditorSearch from '../search/index.vue'
import { CodeMirrorSearchManager } from '../../codeMirror/cmSearch'
import bus from '../../bus'
import { oneDarkThemes, railscastsThemes } from '@/config'
import type { IFileState } from '@shared/types/files'

// CodeMirror 5 instance loose type
type CMInstance = any

const props = defineProps<{
  file: IFileState
}>()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const normalCodeContainer = ref<HTMLDivElement | null>(null)
const editor = ref<CMInstance>(null)
const cleanGeneration = ref<number | undefined>(undefined)
const searchManager = ref<CodeMirrorSearchManager | null>(null)
let resizeObserver: ResizeObserver | null = null

const handleSearchValue = (payload: unknown) => {
  if (editorStore.currentFile?.id !== props.file.id || !searchManager.value) return
  const { value, opt } = payload as { value: string; opt: any }
  searchManager.value.search(value, opt)
}

const handleReplaceValue = (payload: unknown) => {
  if (editorStore.currentFile?.id !== props.file.id || !searchManager.value) return
  const { value, opt } = payload as { value: string; opt: any }
  searchManager.value.replace(value, opt)
}

const handleFindAction = (action: unknown) => {
  if (editorStore.currentFile?.id !== props.file.id || !searchManager.value) return
  const normalizedAction =
    action === 'next' ? 'next' : action === 'prev' || action === 'previous' ? 'previous' : null
  if (!normalizedAction) return
  searchManager.value.find(normalizedAction)
}

const { theme } = storeToRefs(preferencesStore)

const resolveCodeMirrorMode = (pathname: string, language?: string) => {
  const filename = window.path?.basename ? window.path.basename(pathname) : pathname
  if (language && (codeMirror as any).findModeByName) {
    const info = (codeMirror as any).findModeByName(language)
    if (info) return { mode: info.mode, mime: info.mime || (info.mimes && info.mimes[0]) }
  }
  if ((codeMirror as any).findModeByFileName && filename) {
    const info = (codeMirror as any).findModeByFileName(filename)
    if (info) return { mode: info.mode, mime: info.mime || (info.mimes && info.mimes[0]) }
  }
  const ext = filename?.includes('.') ? filename.split('.').pop()?.toLowerCase() : ''
  if (ext) {
    if (ext === 'env') {
      return { mode: 'shell', mime: 'text/x-sh' }
    }
    if (ext === 'json') {
      return { mode: 'javascript', mime: 'application/json' }
    }
    if ((codeMirror as any).findModeByExtension) {
      const info = (codeMirror as any).findModeByExtension(ext)
      if (info) return { mode: info.mode, mime: info.mime || (info.mimes && info.mimes[0]) }
    }
  }
  return { mode: 'null', mime: 'text/plain' }
}

const applyMode = (targetCm: any, pathname: string, language?: string) => {
  const { mode, mime } = resolveCodeMirrorMode(pathname, language)
  if (mode && mode !== 'null') {
    (codeMirror as any).autoLoadMode(targetCm, mode)
    targetCm.setOption('mode', mime || mode)
  } else {
    targetCm.setOption('mode', 'null')
  }
}

const handleUndo = () => {
  if (editor.value && editorStore.currentFile?.id === props.file.id) {
    editor.value.execCommand('undo')
  }
}

const handleRedo = () => {
  if (editor.value && editorStore.currentFile?.id === props.file.id) {
    editor.value.execCommand('redo')
  }
}

const handleSelectAll = () => {
  if (editor.value && editorStore.currentFile?.id === props.file.id) {
    editor.value.execCommand('selectAll')
  }
}

watch(
  () => props.file.isSaved,
  (isSaved) => {
    if (isSaved && editor.value) {
      const nextClean = editor.value.getDoc().changeGeneration(true)
      cleanGeneration.value = nextClean
      if (props.file.codeMirrorState) {
        props.file.codeMirrorState.cleanGeneration = nextClean
        props.file.codeMirrorState.isSaved = true
      }
    }
  }
)

watch(theme, (newTheme) => {
  if (!editor.value) return
  if (railscastsThemes.includes(newTheme)) {
    editor.value.setOption('theme', 'railscasts')
  } else if (oneDarkThemes.includes(newTheme)) {
    editor.value.setOption('theme', 'one-dark')
  } else {
    editor.value.setOption('theme', 'default')
  }
})

watch(
  () => props.file.markdown,
  (newMarkdown) => {
    if (editor.value && typeof newMarkdown === 'string' && newMarkdown !== editor.value.getValue()) {
      editor.value.setValue(newMarkdown)
      searchManager.value?.refresh()
    }
  }
)

onMounted(() => {
  const container = normalCodeContainer.value
  if (!container) return

  const initialText = props.file.codeMirrorState?.text ?? props.file.markdown ?? ''
  let cmTheme = 'default'
  if (railscastsThemes.includes(theme.value)) {
    cmTheme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    cmTheme = 'one-dark'
  }

  const codeMirrorConfig: Record<string, unknown> = {
    value: initialText,
    lineNumbers: true,
    autofocus: true,
    lineWrapping: preferencesStore.wordWrap ?? true,
    styleActiveLine: true,
    tabSize: preferencesStore.tabSize ?? 4,
    indentUnit: preferencesStore.tabSize ?? 4,
    theme: cmTheme,
    dragDrop: false,
    extraKeys: {
      'Cmd-F': () => bus.emit('find', 'find'),
      'Ctrl-F': () => bus.emit('find', 'find'),
      'Cmd-Alt-F': () => bus.emit('replace', 'replace'),
      'Ctrl-H': () => bus.emit('replace', 'replace'),
      'Shift-Cmd-F': () => bus.emit('findInFolder', 'findInFolder'),
      'Shift-Ctrl-F': () => bus.emit('findInFolder', 'findInFolder'),
      'Cmd-G': () => bus.emit('findNext', 'findNext'),
      'Ctrl-G': () => bus.emit('findNext', 'findNext'),
      'Shift-Cmd-G': () => bus.emit('findPrev', 'findPrev'),
      'Shift-Ctrl-G': () => bus.emit('findPrev', 'findPrev'),
      Esc: (cm: any) => {
        bus.emit('search-blur')
        cm.focus()
      }
    }
  }

  const cm = markRaw(codeMirror(container, codeMirrorConfig))
  editor.value = cm

  applyMode(cm, props.file.pathname, props.file.codeLanguage)

  // Restore history for undo/redo stack isolation
  if (props.file.codeMirrorState?.history) {
    try {
      cm.getDoc().setHistory(props.file.codeMirrorState.history)
    } catch (e) {
      console.warn('Failed to restore CodeMirror history', e)
    }
  } else {
    cm.getDoc().clearHistory()
  }

  // Restore cleanGeneration for dirty status tracking
  let cleanGen: number
  if (props.file.isSaved) {
    cleanGen = cm.getDoc().changeGeneration(true)
  } else if (typeof props.file.codeMirrorState?.cleanGeneration === 'number') {
    cleanGen = props.file.codeMirrorState.cleanGeneration
  } else {
    cleanGen = cm.getDoc().changeGeneration(true)
  }
  cleanGeneration.value = cleanGen

  // Restore cursor and scroll
  if (props.file.codeMirrorState?.cursor) {
    try {
      cm.setCursor(props.file.codeMirrorState.cursor)
    } catch {
      setCursorAtFirstLine(cm)
    }
  } else {
    setCursorAtFirstLine(cm)
  }

  if (typeof props.file.codeMirrorState?.scrollTop === 'number') {
    nextTick(() => {
      cm.scrollTo(0, props.file.codeMirrorState?.scrollTop)
    })
  }

  cm.on('change', (_cm: any, changeObj: any) => {
    if (changeObj.origin === 'setValue') return
    const val = cm.getValue()
    props.file.markdown = val
    if (props.file.codeMirrorState) {
      props.file.codeMirrorState.text = val
    }

    const isClean = cleanGeneration.value != null && cm.getDoc().isClean(cleanGeneration.value)
    if (isClean) {
      props.file.isSaved = true
      if (props.file.codeMirrorState) {
        props.file.codeMirrorState.isSaved = true
      }
    } else {
      props.file.isSaved = false
      if (props.file.codeMirrorState) {
        props.file.codeMirrorState.isSaved = false
      }
      if (preferencesStore.autoSave && props.file.pathname) {
        editorStore.HANDLE_AUTO_SAVE({
          id: props.file.id,
          filename: props.file.filename,
          pathname: props.file.pathname,
          markdown: val,
          options: getOptionsFromState(props.file)
        })
      }
    }
  })

  searchManager.value = new CodeMirrorSearchManager(cm, editorStore)

  bus.on('undo', handleUndo)
  bus.on('redo', handleRedo)
  bus.on('selectAll', handleSelectAll)
  bus.on('searchValue', handleSearchValue)
  bus.on('replaceValue', handleReplaceValue)
  bus.on('find-action', handleFindAction)

  resizeObserver = new ResizeObserver(() => {
    if (editor.value) {
      editor.value.refresh()
    }
  })
  resizeObserver.observe(container)
})

onBeforeUnmount(() => {
  bus.off('undo', handleUndo)
  bus.off('redo', handleRedo)
  bus.off('selectAll', handleSelectAll)
  bus.off('searchValue', handleSearchValue)
  bus.off('replaceValue', handleReplaceValue)
  bus.off('find-action', handleFindAction)

  searchManager.value?.destroy()
  searchManager.value = null

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (editor.value) {
    const cm = editor.value
    const text = cm.getValue()
    const scroller = cm.getScrollerElement()
    props.file.markdown = text
    props.file.codeMirrorState = {
      id: props.file.id,
      filename: props.file.filename,
      pathname: props.file.pathname,
      text,
      isSaved: props.file.isSaved,
      encoding: props.file.encoding,
      lineEnding: props.file.lineEnding,
      trimTrailingNewline: props.file.trimTrailingNewline,
      cursor: cm.getCursor(),
      scrollTop: scroller ? scroller.scrollTop : 0,
      codeLanguage: props.file.codeLanguage || '',
      cleanGeneration: cleanGeneration.value,
      history: cm.getDoc().getHistory()
    }
  }
})
</script>

<style>
.normal-code-container {
  position: relative;
  width: 100%;
  height: calc(100vh - var(--titleBarHeight) - 28px);
  box-sizing: border-box;
  overflow: hidden;
  background: var(--editorBgColor);
}
.normal-code-editor {
  width: 100%;
  height: 100%;
}
.normal-code-container .CodeMirror {
  height: 100%;
  font-family: var(--editorFontFamily, 'Fira Code', 'DejaVu Sans Mono', Menlo, Consolas, 'Liberation Mono', Monaco, 'Lucida Console', monospace);
  font-size: var(--editorFontSize, 14px);
  line-height: var(--editorLineHeight, 1.6);
  background: transparent;
  color: var(--editorColor);
}
.normal-code-container .CodeMirror-gutters {
  border-right: 1px solid var(--borderColor, #e0e0e0);
  background-color: var(--itemBgColor, #f7f7f7);
}
.normal-code-container .CodeMirror-linenumber {
  color: var(--editorColor30, #999);
  padding: 0 8px 0 5px;
}
.normal-code-container .CodeMirror-activeline-background,
.normal-code-container .CodeMirror-activeline-gutter {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.05));
}
</style>
