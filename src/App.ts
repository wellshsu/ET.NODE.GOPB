import * as rd from "rd"
import { Helper } from "./Helper"
import * as child_process from "child_process"
import * as path from "path"
setTimeout(() => { }, 2000) // 延时退出，查看日志
process.title = "gopb"

const LEFT_TAG = "<tag>"
const RIGHT_TAG = "</tag>"

let rootDir = path.resolve(".")
// rootDir = "D:/DEV/HSU/EP.GO.ESVR.SRC/test/shared/proto"
Helper.Log("working root: {0}", rootDir)

// 清理文件夹
function cleanDir() {
    if (Helper.HasDirectory(rootDir)) {
        let arr = []
        rd.eachFileFilterSync(rootDir, /\.pb.go$/, (f) => {
            arr.push(f)
        })
        for (let i = 0; i < arr.length; i++) {
            Helper.DeleteFile(arr[i])
        }
    } else {
        Helper.LogError("cleanDir: rootDir doesn't exists")
    }
}

// 编译proto
function compileProto() {
    if (Helper.HasDirectory(rootDir)) {
        rd.eachFileFilterSync(rootDir, /\.proto$/, (f) => {
            let rootCwd = path.dirname(f)
            child_process.exec(Helper.Format("protoc --go_out={0} --proto_path={1} {2}", rootCwd, rootCwd, f), Helper.ExecOpt(rootDir), (err, stdout, stderr) => {
                if (err) {
                    Helper.LogError(err)
                } else {
                    Helper.Log(stdout)
                    let name = path.basename(f).replace(path.extname(f), "")
                    let pbgo = path.join(path.dirname(f), name + ".pb.go")
                    if (Helper.HasFile(pbgo)) {
                        let nctt = ""
                        let lines = Helper.OpenFile(pbgo).toString().split("\n")
                        for (let i = 0; i < lines.length; i++) {
                            let line = lines[i]
                            if (line.indexOf("protobuf") > 0 && line.indexOf(",rep") > 0 && lines.indexOf(",omitempty")) {
                                line = line.replace(",omitempty", "")
                            }
                            nctt += line + "\n"
                        }
                        Helper.SaveFile(pbgo, nctt)
                        Helper.Log("converted: {0}", pbgo)
                    }
                }
            })
        })
    } else {
        Helper.LogError("compileProto: rootDir doesn't exists")
    }
}

class EnumField {
    public Name: string
    public Tag: string
    public Comment: string
}

class EnumMeta {
    public Name: string
    public Fields: Array<EnumField>
}

// 转换.h
function convertHeader() {
    if (Helper.HasDirectory(rootDir)) {
        rd.eachFileFilterSync(rootDir, /\.h$/, (f) => {
            let dir = path.dirname(f)
            let pkg = dir.substring(dir.lastIndexOf(path.sep) + 1)
            let hFile = f
            let gFile = f.replace(".h", ".go")
            let octt = Helper.OpenFile(hFile).toString()
            let olines = octt.split("\n")
            let enums = new Array<EnumMeta>()
            let lastEnumIndex = -1
            let beginParse = false
            let currentEnum: EnumMeta
            for (let i = 0; i < olines.length; i++) {
                let line = olines[i]
                if (Helper.StartWith(line, "enum")) {
                    let structName = line.replace(new RegExp("\t", "gm"), "")
                    structName = structName.replace(new RegExp("\r", "gm"), "")
                    structName = structName.replace(new RegExp(" ", "gm"), "")
                    structName = structName.replace(new RegExp("{", "gm"), "")
                    let index = structName.indexOf("/")
                    if (index > 0) {
                        structName = structName.substr(0, index)
                    }
                    structName = structName.replace(new RegExp("/", "gm"), "")
                    structName = structName.substr(4, structName.length - 4)
                    currentEnum = new EnumMeta()
                    enums.push(currentEnum)
                    currentEnum.Fields = new Array()
                    currentEnum.Name = structName
                    beginParse = true
                    lastEnumIndex = -1 // reset enum value.
                    continue
                }

                if (Helper.StartWith(line, "/") || Helper.IsNullOrEmpty(line)
                    || Helper.StartWith(line, "{") || Helper.StartWith(line, "}")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "*")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "/")
                    || beginParse == false) {
                    continue
                }
                let comment = ""
                let messageName = ""
                messageName = line
                messageName = messageName.replace(new RegExp("\t", "gm"), "")
                messageName = messageName.replace(new RegExp("\r", "gm"), "")
                messageName = messageName.trim()
                // messageName = messageName.replace(new RegExp(" ", "gm"), "")
                if (Helper.IsNullOrEmpty(messageName)) {
                    continue
                }
                let index1 = messageName.indexOf("/")
                if (index1 == 0) {
                    continue
                }
                if (index1 > 0) {
                    comment = messageName.substr(index1, messageName.length)
                    comment = comment.trim().replace(/\/\//gm, "")
                    messageName = messageName.substr(0, index1).trim()
                }
                messageName = messageName.replace(new RegExp("/", "gm"), "")

                let enumIndex

                let index2 = messageName.indexOf("=")
                let index3 = messageName.indexOf(",")
                if (index2 > 0) {
                    let enumIndexStr = messageName.substr(index2 + 1, index3 - index2 - 1)
                    enumIndexStr = enumIndexStr.replace(new RegExp(" ", "gm"), "")
                    enumIndex = parseInt(enumIndexStr)
                    if (isNaN(enumIndex)) {
                        continue // ref enum value.
                    } else {
                        messageName = messageName.substr(0, index2)
                    }
                } else {
                    enumIndex = lastEnumIndex + 1
                }
                lastEnumIndex = enumIndex
                messageName = messageName.replace(new RegExp(",", "gm"), "")
                let field = new EnumField()
                if (Helper.IsNullOrEmpty(messageName) == false) {
                    let p1 = messageName.substring(0, 1)
                    let p2 = messageName.substring(1, messageName.length)
                    messageName = p1.toUpperCase() + p2
                }
                field.Name = messageName
                let tag = ""
                let strs = comment.split(RIGHT_TAG)
                if (strs.length == 2) {
                    tag = strs[0].replace(LEFT_TAG, "").trim()
                    comment = strs[1].trim()
                } else {
                    comment = strs[0].trim()
                }
                if (Helper.IsNullOrEmpty(tag)) {
                    field.Tag = Helper.Format("`id:\"{0}\" name:\"{1}\"`", enumIndex, field.Name)
                } else {
                    field.Tag = Helper.Format("`id:\"{0}\" name:\"{1}\" {2}`", enumIndex, field.Name, tag)
                }
                field.Comment = comment
                currentEnum.Fields.push(field)
            }
            let nlines = []
            nlines.push("//-- Auto generated by gopb --//")
            nlines.push("//--       DO NOT EDIT      --//")
            nlines.push("package " + pkg)

            nlines.push("import (")
            nlines.push("\t\"reflect\"")
            nlines.push("\t\"strconv\"")
            nlines.push(")")

            for (let i = 0; i < enums.length; i++) {
                let ele = enums[i]
                nlines.push(Helper.Format("var {0} _{1}", ele.Name, ele.Name))
                nlines.push(Helper.Format("var {0}IS map[int]string = make(map[int]string)", ele.Name))
                nlines.push(Helper.Format("var {0}SI map[string]int = make(map[string]int)", ele.Name))
            }

            nlines.push("func init() {")
            nlines.push("\tenums := make([][]interface{}, 0)")
            for (let i = 0; i < enums.length; i++) {
                let ele = enums[i]
                nlines.push("\tenums = append(enums, []interface{}{")
                nlines.push(Helper.Format("\t\treflect.TypeOf({0}),", ele.Name))
                nlines.push(Helper.Format("\t\treflect.ValueOf(&{0}).Elem(),", ele.Name))
                nlines.push(Helper.Format("\t\t{0}IS,", ele.Name))
                nlines.push(Helper.Format("\t\t{0}SI,", ele.Name))
                nlines.push("\t})")
            }
            nlines.push("\tfor _, enum := range enums {")
            nlines.push("\t\tttpe := enum[0].(reflect.Type)")
            nlines.push("\t\tvtpe := enum[1].(reflect.Value)")
            nlines.push("\t\tlen := ttpe.NumField()")
            nlines.push("\t\tfor i := 0; i < len; i++ {")
            nlines.push("\t\t\ttfld := ttpe.Field(i)")
            nlines.push("\t\t\tvfld := vtpe.Field(i)")
            nlines.push("\t\t\tsid := tfld.Tag.Get(\"id\")")
            nlines.push("\t\t\tid, _ := strconv.Atoi(sid)")
            nlines.push("\t\t\tvfld.SetInt(int64(id))")
            nlines.push("\t\t\tname := tfld.Tag.Get(\"name\")")
            nlines.push("\t\t\tenum[2].(map[int]string)[id] = name")
            nlines.push("\t\t\tenum[3].(map[string]int)[name] = id")
            nlines.push("\t\t}")
            nlines.push("\t}")
            nlines.push("}")

            for (let i = 0; i < enums.length; i++) {
                let ele = enums[i]
                nlines.push(Helper.Format("type {0}Enum int", ele.Name))
                nlines.push("")
                nlines.push(Helper.Format("type _{0} struct {", ele.Name))
                for (let j = 0; j < ele.Fields.length; j++) {
                    let fld = ele.Fields[j]
                    nlines.push(Helper.Format("\t{0} {1}Enum {2} // {3}", fld.Name, ele.Name, fld.Tag, fld.Comment))
                }
                nlines.push("}")
                nlines.push("")
            }

            let nctt = ""
            for (let i = 0; i < nlines.length; i++) {
                nctt += nlines[i] + "\n"
            }
            Helper.SaveFile(gFile, nctt)
            Helper.Log("converted: {0}", gFile)
            child_process.exec(Helper.Format("goimports -l -w {0}", gFile), Helper.ExecOpt(rootDir))
        })
    } else {
        Helper.LogError("convertHeader: rootDir doesn't exists")
    }
}

function formatHeader() {
    if (Helper.HasDirectory(rootDir)) {
        rd.eachFileFilterSync(rootDir, /\.h$/, (f) => {
            let octt = Helper.OpenFile(f).toString().replace(/\t/gm, "    ").replace(/\r/gm, "")
            let olines = octt.split("\n")
            let beginParse = false
            let maxTagLength = 0 // 标签的最大长度
            for (let i = 0; i < olines.length; i++) {
                let line = olines[i]
                if (Helper.StartWith(line, "enum")) {
                    beginParse = true
                    continue
                }
                if (Helper.StartWith(line, "/") || Helper.IsNullOrEmpty(line)
                    || Helper.StartWith(line, "{") || Helper.StartWith(line, "}")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "*")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "/")
                    || beginParse == false) {
                    continue
                }
                let comment = ""
                let messageName = ""
                messageName = line
                messageName = messageName.replace(new RegExp("\t", "gm"), "")
                messageName = messageName.replace(new RegExp("\r", "gm"), "")
                messageName = messageName.trim()
                // messageName = messageName.replace(new RegExp(" ", "gm"), "")
                if (Helper.IsNullOrEmpty(messageName)) {
                    continue
                }
                let index1 = messageName.indexOf("/")
                if (index1 == 0) {
                    continue
                }
                if (index1 > 0) {
                    comment = messageName.substr(index1, messageName.length)
                    comment = comment.trim().replace(/\/\//gm, "")
                    messageName = messageName.substr(0, index1).trim()
                }
                messageName = messageName.replace(new RegExp("/", "gm"), "")
                if (Helper.IsNullOrEmpty(messageName) == false) {
                    let strs = line.split(",")
                    let leftPart = strs[0]
                    if (leftPart.length > maxTagLength) {
                        maxTagLength = leftPart.length
                    }
                }
            }

            beginParse = false
            let maxCommentLength = 0 // 注释的最大长度
            for (let i = 0; i < olines.length; i++) {
                let line = olines[i]
                if (Helper.StartWith(line, "enum")) {
                    beginParse = true
                    continue
                }
                if (Helper.StartWith(line, "/") || Helper.IsNullOrEmpty(line)
                    || Helper.StartWith(line, "{") || Helper.StartWith(line, "}")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "*")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "/")
                    || beginParse == false) {
                    continue
                }
                let comment = ""
                let messageName = ""
                messageName = line
                messageName = messageName.replace(new RegExp("\t", "gm"), "")
                messageName = messageName.replace(new RegExp("\r", "gm"), "")
                messageName = messageName.trim()
                // messageName = messageName.replace(new RegExp(" ", "gm"), "")
                if (Helper.IsNullOrEmpty(messageName)) {
                    continue
                }
                let index1 = messageName.indexOf("/")
                if (index1 == 0) {
                    continue
                }
                if (index1 > 0) {
                    comment = messageName.substr(index1, messageName.length)
                    comment = comment.trim().replace(/\/\//gm, "")
                    messageName = messageName.substr(0, index1).trim()
                }
                if (Helper.IsNullOrEmpty(messageName) == false) {
                    let strs = comment.split(RIGHT_TAG)
                    if (strs.length == 2) {
                        let len = strs[0].trim().length + RIGHT_TAG.length + maxTagLength
                        if (len > maxCommentLength) {
                            maxCommentLength = len
                        }
                    }
                }
            }

            // 格式化
            beginParse = false
            for (let i = 0; i < olines.length; i++) {
                let line = olines[i]
                if (Helper.StartWith(line, "enum")) {
                    beginParse = true
                    continue
                }
                if (Helper.StartWith(line, "/") || Helper.IsNullOrEmpty(line)
                    || Helper.StartWith(line, "{") || Helper.StartWith(line, "}")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "*")
                    || Helper.StartWith(line.replace(new RegExp(" ", "gm"), ""), "/")
                    || beginParse == false) {
                    continue
                }
                let comment = ""
                let messageName = ""
                messageName = line
                messageName = messageName.replace(new RegExp("\t", "gm"), "")
                messageName = messageName.replace(new RegExp("\r", "gm"), "")
                messageName = messageName.trim()
                // messageName = messageName.replace(new RegExp(" ", "gm"), "")
                if (Helper.IsNullOrEmpty(messageName)) {
                    continue
                }
                let index1 = messageName.indexOf("/")
                if (index1 == 0) {
                    continue
                }
                if (index1 > 0) {
                    comment = messageName.substr(index1, messageName.length)
                    comment = comment.trim().replace(/\/\//gm, "")
                    messageName = messageName.substr(0, index1).trim()
                }
                if (Helper.IsNullOrEmpty(messageName) == false) {
                    let strs = line.split(",")
                    let leftPart = strs[0]

                    let ntag = ""
                    let ncomment = ""
                    strs = comment.split(RIGHT_TAG)
                    if (strs.length == 1) {
                        ncomment = strs[0].trim()
                    } else if (strs.length == 2) {
                        ntag = strs[0].trim() + RIGHT_TAG
                        ncomment = strs[1].trim()
                    }
                    let tagEmptyStr = ""
                    let tagEmptyLen = maxTagLength - leftPart.length
                    tagEmptyLen += 4
                    for (let i = 0; i < tagEmptyLen; i++) {
                        tagEmptyStr += " "
                    }
                    let commentEmptyStr = ""
                    let commentEmptyLen = maxCommentLength - leftPart.length - ntag.length - tagEmptyStr.length
                    commentEmptyLen += 4
                    for (let i = 0; i < commentEmptyLen; i++) {
                        commentEmptyStr += " "
                    }
                    let nline = Helper.Format("{0}, //{1}{2}{3}{4}", leftPart, tagEmptyStr, ntag, commentEmptyStr, ncomment)
                    olines[i] = nline
                }
            }

            octt = ""
            for (let i = 0; i < olines.length; i++) {
                i < olines.length - 1 ? octt += olines[i] + "\n" : octt += olines[i]
            }
            Helper.SaveFile(f, octt)
        })
    } else {
        Helper.LogError("formatHeader: rootDir doesn't exists")
    }
}

cleanDir()
compileProto()
formatHeader()
convertHeader()