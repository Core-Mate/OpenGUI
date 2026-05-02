package com.coremate.opengui.aop.processor

import com.google.devtools.ksp.processing.CodeGenerator
import com.google.devtools.ksp.processing.KSPLogger
import com.google.devtools.ksp.processing.Resolver // Ensure this is the KSP Resolver.
import com.google.devtools.ksp.processing.SymbolProcessor
import com.google.devtools.ksp.symbol.KSAnnotated
import com.google.devtools.ksp.symbol.KSDeclaration
import com.coremate.opengui.aop.annotations.TrackEvent

class AopProcessor(
    private val codeGenerator: CodeGenerator,
    private val logger: KSPLogger
) : SymbolProcessor {

    override fun process(resolver: Resolver): List<KSAnnotated> { // This Resolver type is now the KSP Resolver.
        logger.info("AOP Processor: Running...")

        // Example: find all symbols annotated with @Track Event
        // get Symbols With Annotation is a member of com.google.devtools.ksp.processing.Resolver
        val symbols = resolver.getSymbolsWithAnnotation(TrackEvent::class.qualifiedName!!) // Use qualifiedName.

        symbols.forEach { symbol ->
            if (symbol is KSDeclaration) { // Type-check and downcast.
                logger.info("Found @TrackEvent on: ${symbol.simpleName.asString()}")
            } else {
                // If the symbol is not a declaration, handle it as needed
                // For example, @Track Event may be applied to type parameters or other non-declaration symbols
                logger.warn("Found @TrackEvent on a non-declaration symbol: ${symbol.location}")
            }
        }

        // Return an empty list to indicate that no symbols are deferred.
        return emptyList()
    }
}
