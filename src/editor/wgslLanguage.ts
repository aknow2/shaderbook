import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { clike } from '@codemirror/legacy-modes/mode/clike'
import { tags } from '@lezer/highlight'

function words(source: string) {
  return Object.fromEntries(source.split(/\s+/).filter(Boolean).map((word) => [word, true]))
}

const wgslKeywords = words(`
  alias break case const const_assert continue continuing default diagnostic discard else
  enable false fn for if let loop override requires return struct switch true var while
`)

const wgslBlockKeywords = words('for if loop switch while struct')

const wgslTypes = words(`
  array atomic bool f16 f32 i32 mat2x2f mat2x3f mat2x4f mat3x2f mat3x3f mat3x4f
  mat4x2f mat4x3f mat4x4f ptr sampler sampler_comparison texture_1d texture_2d
  texture_2d_array texture_3d texture_cube texture_cube_array texture_depth_2d
  texture_depth_2d_array texture_depth_cube texture_depth_cube_array texture_depth_multisampled_2d
  texture_external texture_multisampled_2d texture_storage_1d texture_storage_2d
  texture_storage_2d_array texture_storage_3d u32 vec2f vec2h vec2i vec2u vec3f vec3h
  vec3i vec3u vec4f vec4h vec4i vec4u
`)

const wgslBuiltins = words(`
  abs acos acosh all any arrayLength asin asinh atan atan2 atanh ceil clamp cos cosh
  countLeadingZeros countOneBits countTrailingZeros cross degrees determinant distance dot
  exp exp2 extractBits faceForward firstLeadingBit firstTrailingBit floor fma fract frexp
  insertBits inverseSqrt ldexp length log log2 max min mix modf normalize pow quantizeToF16
  radians reflect refract reverseBits round saturate sign sin sinh smoothstep sqrt step tan tanh
  transpose trunc textureDimensions textureGather textureGatherCompare textureLoad textureNumLayers
  textureNumLevels textureNumSamples textureSample textureSampleBaseClampToEdge textureSampleBias
  textureSampleCompare textureSampleCompareLevel textureSampleGrad textureSampleLevel textureStore
`)

const wgslNumber =
  /^(?:0x[0-9a-f]+[iu]?|0b[01]+[iu]?|(?:(?:\d+\.\d*|\.\d+|\d+)(?:e[-+]?\d+)?|\d+)[fhiu]?)/i

const parser = clike({
  name: 'wgsl',
  keywords: wgslKeywords,
  types: wgslTypes,
  builtin: wgslBuiltins,
  blockKeywords: wgslBlockKeywords,
  atoms: words('true false'),
  number: wgslNumber,
  isIdentifierChar: /[\w]/,
  hooks: {
    '@': (stream: { eatWhile: (match: RegExp) => boolean }) => {
      stream.eatWhile(/[\w]/)
      return 'attribute'
    },
  },
}) as StreamParser<unknown>

parser.tokenTable = {
  attribute: tags.annotation,
}

export const wgslStreamParser = parser

export const wgslLanguage = StreamLanguage.define(wgslStreamParser)
