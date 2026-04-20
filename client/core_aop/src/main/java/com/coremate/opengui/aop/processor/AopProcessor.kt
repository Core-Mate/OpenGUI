package com.coremate.opengui.aop.processor

import com.google.devtools.ksp.processing.CodeGenerator
import com.google.devtools.ksp.processing.KSPLogger
import com.google.devtools.ksp.processing.Resolver // 确保导入的是 KSP 的 Resolver
import com.google.devtools.ksp.processing.SymbolProcessor
import com.google.devtools.ksp.symbol.KSAnnotated
import com.google.devtools.ksp.symbol.KSDeclaration
import com.coremate.opengui.aop.annotations.TrackEvent

class AopProcessor(
    private val codeGenerator: CodeGenerator,
    private val logger: KSPLogger
) : SymbolProcessor {

    override fun process(resolver: Resolver): List<KSAnnotated> { // 这里的 Resolver 类型现在是 KSP 的 Resolver
        logger.info("AOP Processor: Running...")

        // 示例：查找所有使用了 @TrackEvent 注解的符号
        // getSymbolsWithAnnotation 方法是 com.google.devtools.ksp.processing.Resolver 的成员
        val symbols = resolver.getSymbolsWithAnnotation(TrackEvent::class.qualifiedName!!) // 使用 qualifiedName

        symbols.forEach { symbol ->
            if (symbol is KSDeclaration) { // 进行类型检查和向下转型
                logger.info("Found @TrackEvent on: ${symbol.simpleName.asString()}")
            } else {
                // 如果 symbol 不是一个声明，你可能需要根据实际情况处理
                // 例如，@TrackEvent 可能被应用在类型参数或其他非声明的符号上
                logger.warn("Found @TrackEvent on a non-declaration symbol: ${symbol.location}")
            }
        }

        // 返回一个空列表，表示我们不推迟任何符号的处理。
        return emptyList()
    }
}